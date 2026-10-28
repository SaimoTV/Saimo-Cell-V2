const { withAppBuildGradle, withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const { mkdirSync, writeFileSync } = require('fs');
const { join } = require('path');

const DEPENDENCY = 'implementation("com.squareup.okhttp3:okhttp-dnsoverhttps:4.12.0")';

/**
 * Instala no cliente OkHttp compartilhado pelo React Native e react-native-video
 * o mesmo DNS-over-HTTPS e o tratamento de host inválido usados pelo
 * SaimoTV-Android. Alguns links Telecine têm um rótulo só de underscores, que
 * o Java rejeita antes de enviar a requisição.
 */
module.exports = function withAndroidDoH(config) {
  config = withAppBuildGradle(config, next => {
    if (!next.modResults.contents.includes('okhttp-dnsoverhttps')) {
      next.modResults.contents = next.modResults.contents.replace(
        /dependencies\s*\{/,
        match => `${match}\n    ${DEPENDENCY}`,
      );
    }
    return next;
  });

  config = withMainApplication(config, next => {
    if (!next.modResults.contents.includes('SaimoNetwork.install()')) {
      next.modResults.contents = next.modResults.contents.replace(
        'super.onCreate()',
        'super.onCreate()\n    SaimoNetwork.install()',
      );
    }
    return next;
  });

  return withDangerousMod(config, ['android', async next => {
    const sourceDir = join(
      next.modRequest.platformProjectRoot,
      'app/src/main/java/com/saimo/tv',
    );
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'SaimoNetwork.kt'), `package com.saimo.tv

import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import okhttp3.OkHttpClient
import okhttp3.Dns
import okhttp3.Interceptor
import okhttp3.dnsoverhttps.DnsOverHttps
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

object SaimoNetwork {
  private val originalHosts = ConcurrentHashMap<String, String>()
  private val playlistPaths = ConcurrentHashMap<String, String>()

  private val playlistPathInterceptor = Interceptor { chain ->
    val request = chain.request()
    val url = request.url
    val manifestDirectory = url.encodedPath.substringBeforeLast('/', "") + "/"
    val nested = url.queryParameter("url")?.toHttpUrlOrNull()

    if (nested != null) {
      val nestedDirectory = nested.encodedPath.substringBeforeLast('/', "") + "/"
      playlistPaths["${'$'}{url.host}|${'$'}manifestDirectory"] = nestedDirectory
      return@Interceptor chain.proceed(request)
    }

    val prefix = playlistPaths.keys
      .filter { key -> key.startsWith("${'$'}{url.host}|") }
      .map { key -> key.substringAfter('|') }
      .filter { path -> url.encodedPath.startsWith(path) }
      .maxByOrNull { path -> path.length }
      ?: return@Interceptor chain.proceed(request)
    val correctedDirectory = playlistPaths["${'$'}{url.host}|${'$'}prefix"]
      ?: return@Interceptor chain.proceed(request)
    val corrected = url.newBuilder()
      .encodedPath(correctedDirectory + url.encodedPath.removePrefix(prefix))
      .build()
    chain.proceed(request.newBuilder().url(corrected).build())
  }

  private fun shortenedHost(host: String): String? {
    val labels = host.split(".")
    if (labels.none { label -> label.contains('_') }) return null
    val valid = labels.filterNot { label -> label.contains('_') }
    return if (valid.size >= 2) valid.joinToString(".") else null
  }

  private val validHostInterceptor = Interceptor { chain ->
    val originalRequest = chain.request()
    val originalHost = originalRequest.url.host
    val validHost = shortenedHost(originalHost)
      ?: return@Interceptor chain.proceed(originalRequest)

    originalHosts[validHost] = originalHost
    val response = chain.proceed(
      originalRequest.newBuilder()
        .url(originalRequest.url.newBuilder().host(validHost).build())
        .header("Host", originalHost)
        .build(),
    )
    // Preserva a URL completa nos recarregamentos periódicos da playlist HLS.
    response.newBuilder().request(originalRequest).build()
  }

  private val dns: Dns by lazy {
    val bootstrap = OkHttpClient.Builder().build()
    val doh = DnsOverHttps.Builder()
      .client(bootstrap)
      .url("https://1.1.1.1/dns-query".toHttpUrl())
      .bootstrapDnsHosts(
        InetAddress.getByName("1.1.1.1"),
        InetAddress.getByName("1.0.0.1"),
      )
      .includeIPv6(false)
      .build()
    object : Dns {
      override fun lookup(hostname: String): List<InetAddress> =
        doh.lookup(originalHosts[hostname] ?: hostname)
    }
  }

  fun install() {
    OkHttpClientProvider.setOkHttpClientFactory(
      OkHttpClientFactory {
        OkHttpClientProvider.createClientBuilder()
          .dns(dns)
          .addInterceptor(playlistPathInterceptor)
          .addInterceptor(validHostInterceptor)
          .followRedirects(true)
          .followSslRedirects(true)
          .build()
      },
    )
  }
}
`, 'utf8');
    return next;
  }]);
};
