package com.saimo.tv

import android.content.Context
import android.media.audiofx.LoudnessEnhancer
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
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
 * Áudio Inteligente (Normalização de Volume / Loudness Normalization) no Android Celular.
 *
 * Conecta-se nativamente ao ExoPlayer do react-native-video via [RNVExoplayerPlugin]
 * e aplica o equalizador dinâmico LoudnessEnhancer para nivelar canais baixos (+8 dB)
 * sem distorcer canais normais ou altos.
 */
@UnstableApi
object SaimoAudioInteligente : RNVExoplayerPlugin {

    private const val TAG = "SaimoAudio"
    private const val PREFS_NAME = "saimo_audio_prefs"
    private const val KEY_ENABLED = "audio_inteligente"
    private const val GANHO_ALVO_MB = 800 // +8 dB

    @Volatile
    private var isEnabled: Boolean = true

    private val mainHandler = Handler(Looper.getMainLooper())
    private val activePlayers = Collections.synchronizedMap(WeakHashMap<ExoPlayer, LoudnessEnhancer>())
    private val activeSessions = Collections.synchronizedMap(WeakHashMap<ExoPlayer, Int>())
    private var appContext: Context? = null

    fun install(context: Context) {
        appContext = context.applicationContext
        val prefs = appContext?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        isEnabled = prefs?.getBoolean(KEY_ENABLED, true) ?: true
        runCatching {
            ReactNativeVideoManager.getInstance().registerPlugin(this)
        }
    }

    fun setEnabled(enabled: Boolean) {
        isEnabled = enabled
        appContext?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            ?.edit()
            ?.putBoolean(KEY_ENABLED, enabled)
            ?.apply()

        mainHandler.post {
            synchronized(activePlayers) {
                for ((_, enhancer) in activePlayers) {
                    runCatching {
                        enhancer.enabled = enabled
                        if (enabled) enhancer.setTargetGain(GANHO_ALVO_MB)
                    }
                }
            }
        }
    }

    override fun onInstanceCreated(id: String, player: ExoPlayer) {
        mainHandler.post {
            val analytics = object : AnalyticsListener {
                override fun onAudioSessionIdChanged(
                    eventTime: AnalyticsListener.EventTime,
                    audioSessionId: Int
                ) {
                    vincular(player, audioSessionId)
                }
            }
            player.addAnalyticsListener(analytics)

            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY) {
                        vincular(player, player.audioSessionId)
                    }
                }
            })

            vincular(player, player.audioSessionId)
        }
    }

    override fun onInstanceRemoved(id: String, player: ExoPlayer) {
        mainHandler.post {
            synchronized(activePlayers) {
                activeSessions.remove(player)
                activePlayers.remove(player)?.let { enhancer ->
                    runCatching {
                        enhancer.enabled = false
                        enhancer.release()
                    }
                }
            }
        }
    }

    private fun vincular(player: ExoPlayer, sessionId: Int) {
        if (sessionId == C.AUDIO_SESSION_ID_UNSET || sessionId <= 0) return

        synchronized(activePlayers) {
            val sessionAnterior = activeSessions[player]
            val existente = activePlayers[player]
            if (existente != null && sessionAnterior == sessionId) {
                runCatching { existente.enabled = isEnabled }
                return
            }

            // Sessão mudou ou é a primeira: liberar efeito antigo
            existente?.let {
                runCatching {
                    it.enabled = false
                    it.release()
                }
            }
            activePlayers.remove(player)
            activeSessions[player] = sessionId

            if (!isEnabled) return

            runCatching {
                val enhancer = LoudnessEnhancer(sessionId).apply {
                    setTargetGain(GANHO_ALVO_MB)
                    enabled = true
                }
                activePlayers[player] = enhancer
                Log.d(TAG, "LoudnessEnhancer conectado ao ExoPlayer celular (sessão $sessionId)")
            }.onFailure {
                Log.w(TAG, "Falha ao conectar LoudnessEnhancer no celular", it)
            }
        }
    }
}

class SaimoAudioInteligenteModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SaimoAudioInteligente"

    @ReactMethod
    fun setEnabled(enabled: Boolean) {
        SaimoAudioInteligente.setEnabled(enabled)
    }
}

class SaimoAudioInteligentePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(SaimoAudioInteligenteModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
