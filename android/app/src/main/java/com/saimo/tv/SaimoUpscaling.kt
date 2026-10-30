package com.saimo.tv

import android.content.Context
import android.opengl.GLES20
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Effect
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.util.GlProgram
import androidx.media3.common.util.GlUtil
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BaseGlShaderProgram
import androidx.media3.effect.GlEffect
import androidx.media3.exoplayer.ExoPlayer
import com.brentvatne.exoplayer.RNVExoplayerPlugin
import com.brentvatne.react.ReactNativeVideoManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.util.Collections
import java.util.WeakHashMap

/**
 * Super Resolução (Upscaling) em tempo real via GPU (OpenGL ES 2.0) no Android Celular.
 *
 * Conecta-se nativamente ao ExoPlayer do react-native-video via [RNVExoplayerPlugin]
 * e aplica reconstrução espacial para Full HD / 4K + Contrast-Adaptive Sharpening (CAS)
 * em luminância Rec.709 com Noise Gate e Trava Anti-Halo.
 */
@UnstableApi
object SaimoUpscaling : RNVExoplayerPlugin {

    private const val PREFS_NAME = "saimo_upscaling_prefs"
    private const val KEY_MODE = "upscaling_mode"

    @Volatile
    private var currentMode: String = "off"

    private val mainHandler = Handler(Looper.getMainLooper())
    private val activePlayers = Collections.synchronizedMap(WeakHashMap<ExoPlayer, String>())
    /** Altura do vídeo de cada player (0 = ainda não se sabe). */
    private val alturaDoVideo = Collections.synchronizedMap(WeakHashMap<ExoPlayer, Int>())
    private var appContext: Context? = null

    fun install(context: Context) {
        appContext = context.applicationContext
        val prefs = appContext?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        currentMode = prefs?.getString(KEY_MODE, "off") ?: "off"
        runCatching {
            ReactNativeVideoManager.getInstance().registerPlugin(this)
        }
    }

    fun setMode(mode: String) {
        val normalized = when (mode) {
            "hd", "4k" -> mode
            else -> "off"
        }
        currentMode = normalized
        appContext?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            ?.edit()
            ?.putString(KEY_MODE, normalized)
            ?.apply()

        mainHandler.post {
            synchronized(activePlayers) {
                for (player in activePlayers.keys.toList()) {
                    aplicarNoPlayer(player, modoEfetivo(player))
                }
            }
        }
    }

    override fun onInstanceCreated(id: String, player: ExoPlayer) {
        mainHandler.post {
            activePlayers[player] = "off"
            // O efeito só entra depois de saber o tamanho do vídeo (e só se ele for menor que o alvo).
            player.addListener(object : Player.Listener {
                override fun onTracksChanged(tracks: Tracks) {
                    val altura = tracks.groups
                        .filter { it.type == C.TRACK_TYPE_VIDEO && it.isSelected }
                        .flatMap { g -> (0 until g.length).filter { g.isTrackSelected(it) }.map { g.getTrackFormat(it).height } }
                        .maxOrNull() ?: return
                    if (altura > 0) videoMudou(player, altura)
                }

                override fun onVideoSizeChanged(videoSize: VideoSize) {
                    if (videoSize.height > 0) videoMudou(player, videoSize.height)
                }
            })
            aplicarNoPlayer(player, modoEfetivo(player))
        }
    }

    private fun videoMudou(player: ExoPlayer, altura: Int) {
        if (alturaDoVideo[player] == altura) return
        alturaDoVideo[player] = altura
        aplicarNoPlayer(player, modoEfetivo(player))
    }

    /** Altura da tela do aparelho (o lado menor, em pixels reais), limitada a 2160. */
    private fun alturaDaTela(): Int {
        val dm = android.content.res.Resources.getSystem().displayMetrics
        return minOf(dm.widthPixels, dm.heightPixels).coerceIn(480, 2160)
    }

    /**
     * O modo que vale para o vídeo que está tocando. Vídeo que já chega na altura do alvo (filme
     * 4K no modo 4K, 1080p na tela 1080p) fica sem efeito: o shader em cada quadro 4K e a cópia
     * extra do pipeline de efeitos só faziam o vídeo travar.
     */
    private fun modoEfetivo(player: ExoPlayer): String {
        val modo = currentMode
        if (modo == "off") return "off"
        val altura = alturaDoVideo[player] ?: 0
        if (altura <= 0) return activePlayers[player]?.takeIf { it.isNotEmpty() } ?: "off"
        val alvo = if (modo == "4k") alturaDaTela() else minOf(1080, alturaDaTela())
        return if (altura >= alvo) "off" else modo
    }

    override fun onInstanceRemoved(id: String, player: ExoPlayer) {
        mainHandler.post {
            activePlayers.remove(player)
        }
    }

    private fun aplicarNoPlayer(player: ExoPlayer, modo: String) {
        runCatching {
            val anterior = activePlayers[player]
            if (anterior == modo) return
            activePlayers[player] = modo
            val efeitos: List<Effect> = when (modo) {
                "hd" -> listOf(CasGlEffect(intensidade = 0.65f, ultra4k = false))
                "4k" -> listOf(CasGlEffect(intensidade = 1.0f, ultra4k = true))
                else -> emptyList()
            }
            player.setVideoEffects(efeitos)
        }
    }

    private class CasGlEffect(
        private val intensidade: Float,
        private val ultra4k: Boolean
    ) : GlEffect {
        override fun toGlShaderProgram(context: Context, useHdr: Boolean): BaseGlShaderProgram {
            return CasShaderProgram(useHdr, intensidade, ultra4k)
        }
    }

    private class CasShaderProgram(
        useHdr: Boolean,
        private val intensidade: Float,
        private val ultra4k: Boolean
    ) : BaseGlShaderProgram(useHdr, /* texturePoolCapacity = */ 1) {

        private val glProgram: GlProgram = GlProgram(VERTEX_SHADER, FRAGMENT_SHADER).apply {
            setBufferAttribute(
                "aFramePosition",
                GlUtil.getNormalizedCoordinateBounds(),
                GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
            )
            setFloatsUniform("uTransformationMatrix", GlUtil.create4x4IdentityMatrix())
            setFloatsUniform("uTexTransformationMatrix", GlUtil.create4x4IdentityMatrix())
        }

        private var texelW = 1f / 1920f
        private var texelH = 1f / 1080f

        override fun configure(inputWidth: Int, inputHeight: Int): Size {
            val inW = inputWidth.coerceAtLeast(1)
            val inH = inputHeight.coerceAtLeast(1)
            texelW = 1f / inW.toFloat()
            texelH = 1f / inH.toFloat()

            val dm = android.content.res.Resources.getSystem().displayMetrics
            val screenH = minOf(dm.widthPixels, dm.heightPixels).coerceIn(480, 2160)

            // Nunca além da tela: ampliar acima dela é desenhar pixels que o sistema joga fora.
            val targetMaxH = if (ultra4k) screenH else minOf(maxOf(inH, 1080), screenH, 1440)

            if (inH >= targetMaxH) {
                return Size(inW, inH)
            }

            val scale = targetMaxH.toFloat() / inH.toFloat()
            val outW = ((inW * scale).toInt() and 1.inv()).coerceIn(inW, 3840)
            val outH = ((inH * scale).toInt() and 1.inv()).coerceIn(inH, 2160)
            return Size(outW, outH)
        }

        override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
            glProgram.use()
            glProgram.setSamplerTexIdUniform("uTexSampler", inputTexId, /* texUnitIndex = */ 0)
            glProgram.setFloatsUniform("uTexelSize", floatArrayOf(texelW, texelH))
            glProgram.setFloatUniform("uSharpness", intensidade)
            glProgram.setFloatUniform("uUltraMode", if (ultra4k) 1.0f else 0.0f)
            glProgram.bindAttributesAndUniforms()
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
            GlUtil.checkGlError()
        }

        override fun release() {
            super.release()
            runCatching { glProgram.delete() }
        }
    }

    private const val VERTEX_SHADER = """
        attribute vec4 aFramePosition;
        uniform mat4 uTransformationMatrix;
        uniform mat4 uTexTransformationMatrix;
        varying vec2 vTexSamplingCoord;
        void main() {
            gl_Position = uTransformationMatrix * aFramePosition;
            vec4 texPos = vec4(aFramePosition.x * 0.5 + 0.5, aFramePosition.y * 0.5 + 0.5, 0.0, 1.0);
            vTexSamplingCoord = (uTexTransformationMatrix * texPos).xy;
        }
    """

    private const val FRAGMENT_SHADER = """
        precision highp float;
        uniform sampler2D uTexSampler;
        uniform vec2 uTexelSize;
        uniform float uSharpness;
        uniform float uUltraMode;
        varying vec2 vTexSamplingCoord;

        float luma(vec3 rgb) {
            return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
        }

        void main() {
            vec2 uv = vTexSamplingCoord;
            vec2 px = uTexelSize;

            vec4 center = texture2D(uTexSampler, uv);
            vec3 c  = center.rgb;
            vec3 n  = texture2D(uTexSampler, uv + vec2(0.0, -px.y)).rgb;
            vec3 s  = texture2D(uTexSampler, uv + vec2(0.0,  px.y)).rgb;
            vec3 w  = texture2D(uTexSampler, uv + vec2(-px.x, 0.0)).rgb;
            vec3 e  = texture2D(uTexSampler, uv + vec2( px.x, 0.0)).rgb;
            vec3 nw = texture2D(uTexSampler, uv + vec2(-px.x, -px.y)).rgb;
            vec3 ne = texture2D(uTexSampler, uv + vec2( px.x, -px.y)).rgb;
            vec3 sw = texture2D(uTexSampler, uv + vec2(-px.x,  px.y)).rgb;
            vec3 se = texture2D(uTexSampler, uv + vec2( px.x,  px.y)).rgb;

            float lc  = luma(c);
            float ln  = luma(n);
            float ls  = luma(s);
            float lw  = luma(w);
            float le  = luma(e);
            float lnw = luma(nw);
            float lne = luma(ne);
            float lsw = luma(sw);
            float lse = luma(se);

            float mn4 = min(min(ln, ls), min(lw, le));
            float mx4 = max(max(ln, ls), max(lw, le));
            float mnDiag = min(min(lnw, lne), min(lsw, lse));
            float mxDiag = max(max(lnw, lne), max(lsw, lse));

            float mnL = 0.5 * (mn4 + min(mn4, min(mnDiag, lc)));
            float mxL = 0.5 * (mx4 + max(mx4, max(mxDiag, lc)));

            float contrast = mxL - mnL;
            float noiseGate = smoothstep(0.015, 0.055, contrast);

            float amp = clamp(min(mnL, 1.0 - mxL) / max(mxL, 0.0001), 0.0, 1.0);
            amp = sqrt(amp);

            float strength = (uUltraMode > 0.5) ? 0.82 : 0.55;
            float peak = -1.0 / mix(8.0, 5.0, strength * clamp(uSharpness, 0.0, 1.0));
            float wt = amp * peak * noiseGate;
            float diagWt = (uUltraMode > 0.5) ? (wt * 0.25) : 0.0;

            float sumW = 1.0 + 4.0 * wt + 4.0 * diagWt;
            float sharpL = (lc + (ln + ls + lw + le) * wt + (lnw + lne + lsw + lse) * diagWt) / max(sumW, 0.0001);

            sharpL = clamp(sharpL, mnL, mxL);

            float delta = sharpL - lc;
            vec3 outColor = clamp(c + vec3(delta), 0.0, 1.0);
            gl_FragColor = vec4(outColor, center.a);
        }
    """
}

class SaimoUpscalingModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SaimoUpscaling"

    @ReactMethod
    fun setMode(mode: String) {
        SaimoUpscaling.setMode(mode)
    }
}

class SaimoUpscalingPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(SaimoUpscalingModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
