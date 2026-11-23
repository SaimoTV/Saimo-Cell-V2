package com.saimo.tv

import android.content.Context
import android.content.res.Configuration
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * Acessibilidade (Ajustes > Aparência e acessibilidade > Tamanho do texto).
 *
 * Multiplica a escala de letras do sistema só neste app: os textos do React
 * Native seguem o fontScale da Activity, então trocar a escala e recriar a
 * tela vale para o app todo, sem tocar em cada estilo.
 */
object SaimoTamanho {
    private const val ARQUIVO = "saimo_tamanho"
    private const val CHAVE = "escala"

    fun escala(context: Context): Float =
        context.getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE).getFloat(CHAVE, 1f).coerceIn(0.8f, 1.6f)

    fun guardar(context: Context, valor: Float) {
        context.getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE).edit().putFloat(CHAVE, valor).commit()
    }

    /** O contexto da tela com a escala escolhida (o mesmo, se for a normal). */
    fun envolver(base: Context): Context {
        val e = escala(base)
        if (e == 1f) return base
        val config = Configuration(base.resources.configuration)
        config.fontScale = config.fontScale * e
        return base.createConfigurationContext(config)
    }
}

class SaimoTamanhoModule(private val contexto: ReactApplicationContext) : ReactContextBaseJavaModule(contexto) {
    override fun getName(): String = "SaimoTamanho"

    @ReactMethod
    fun atual(promise: Promise) = promise.resolve(SaimoTamanho.escala(contexto).toDouble())

    /** Guarda e recria a tela: a próxima pintura já sai no tamanho novo. */
    @ReactMethod
    fun definir(valor: Double) {
        SaimoTamanho.guardar(contexto, valor.toFloat())
        val tela = contexto.currentActivity ?: return
        tela.runOnUiThread { tela.recreate() }
    }
}

class SaimoTamanhoPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(SaimoTamanhoModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
