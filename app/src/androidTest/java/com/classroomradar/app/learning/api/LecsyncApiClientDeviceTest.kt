package com.classroomradar.app.learning.api

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class LecsyncApiClientDeviceTest {
    @Test
    fun fullTranslationEnvelopeAndTokenRefreshWork() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = DeviceCredentialStore(context)
        store.clear()
        val server = MockWebServer()
        val paths = java.util.concurrent.CopyOnWriteArrayList<String>()
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                paths += request.path.orEmpty()
                return when (paths.size) {
                    1 -> MockResponse().setResponseCode(401).setBody("{\"detail\":{\"message\":\"expired\"}}")
                    2 -> MockResponse().setResponseCode(201).setBody("{\"deviceId\":\"new-device\",\"token\":\"new-development-token\",\"tokenType\":\"bearer\"}")
                    else -> MockResponse().setResponseCode(200).setBody("{\"requestId\":\"req-1\",\"status\":\"succeeded\",\"result\":{\"text\":\"车床\",\"model\":\"translate-default\"},\"usage\":{\"chargeCents\":\"0.001\"}}")
                }
            }
        }
        server.start()
        try {
            val client = LecsyncApiClient(context, AiServiceConfig(context).also { it.save(server.url("/").toString()) })
            store.save(DeviceCredential("stale-device", "stale-development-token"))
            assertTrue(store.load() != null)
            val result = runCatching {
                System.err.println("Cloud retry test: request start")
                runBlocking {
                    client.translate(LecsyncTranslationRequest("lathe", "zh", "en", "Engineering", listOf(LecsyncTerm("lathe", "车床"))))
                }
            }.getOrElse { error ->
                throw AssertionError("base=${AiServiceConfig(context).baseUrl}, requests=${server.requestCount}", error)
            }
            System.err.println("Cloud retry test: request complete ${result.finalText}")
            assertEquals("车床", result.finalText)
            assertEquals(listOf("/v2/lecsync/translate", "/v1/devices/register", "/v2/lecsync/translate"), paths)
            assertTrue(server.url("/").host in setOf("localhost", "127.0.0.1"))
        } finally {
            store.clear()
            server.shutdown()
        }
    }

    @Test
    fun realtimeReceivesTranscriptTranslationDigestAndUsage() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = DeviceCredentialStore(context)
        store.clear()
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(201).setBody("{\"deviceId\":\"device\",\"token\":\"development-token\",\"tokenType\":\"bearer\"}"))
        val received = java.util.concurrent.CopyOnWriteArrayList<JsonObject>()
        val latch = CountDownLatch(4)
        val listener = object : okhttp3.WebSocketListener() {
            override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                webSocket.send("{\"type\":\"session.ready\",\"sessionId\":\"s1\"}")
                webSocket.send("{\"type\":\"transcript.final\",\"segmentId\":\"1\",\"text\":\"A lathe\",\"startMs\":0,\"endMs\":1000,\"speaker\":\"speaker_0\"}")
                webSocket.send("{\"type\":\"translation.final\",\"segmentId\":\"1\",\"text\":\"车床\",\"sourceText\":\"A lathe\",\"targetLanguage\":\"zh\"}")
                webSocket.send("{\"type\":\"digest.update\",\"sections\":[{\"title\":\"Machines\",\"points\":[\"Lathes\"],\"status\":\"pending\"}]}")
                webSocket.send("{\"type\":\"usage.update\",\"effectiveSeconds\":1.0,\"accruedCents\":0.006}")
            }
        }
        server.enqueue(MockResponse().withWebSocketUpgrade(listener))
        server.start()
        try {
            val client = LecsyncApiClient(context, AiServiceConfig(context).also { it.save(server.url("/").toString()) })
            val config = RealtimeConfig(RealtimeTranscribeConfig(listOf("en", "zh"), speakers = true), RealtimeTranslateConfig(listOf("en", "zh")), digest = true)
            val stream = client.openRealtime(config, object : LecsyncApiClient.Listener {
                override fun onEvent(text: String) {
                    System.err.println("Realtime event: $text")
                    received += Json.parseToJsonElement(text) as JsonObject
                    latch.countDown()
                }
                override fun onError(error: Throwable) {
                    System.err.println("Realtime error: ${error.message}")
                }
                override fun onClosed(code: Int, reason: String) = Unit
            })
            assertTrue(latch.await(15, TimeUnit.SECONDS))
            assertTrue(received.any { it["type"]?.jsonPrimitive?.content == "transcript.final" })
            assertTrue(received.any { it["type"]?.jsonPrimitive?.content == "translation.final" })
            assertTrue(received.any { it["type"]?.jsonPrimitive?.content == "digest.update" })
            System.err.println("Realtime types: " + received.map { it["type"] })
            assertTrue(received.any { it["type"]?.jsonPrimitive?.content == "usage.update" })
            stream.control("session.stop")
            stream.close()
        } finally {
            store.clear()
            server.shutdown()
        }
    }

    @Test
    fun realtimeRefreshesExpiredTokenWithoutReplacingClientStream() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = DeviceCredentialStore(context)
        store.clear()
        val server = MockWebServer()
        val ready = CountDownLatch(1)
        val paths = java.util.concurrent.CopyOnWriteArrayList<String>()
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                paths += request.path.orEmpty()
                return when (request.path) {
                    "/v2/lecsync/realtime" -> if (paths.count { it == "/v2/lecsync/realtime" } == 1) {
                        MockResponse().setResponseCode(401)
                    } else {
                        MockResponse().withWebSocketUpgrade(object : okhttp3.WebSocketListener() {
                            override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                                webSocket.send("{\"type\":\"session.ready\",\"sessionId\":\"recovered\"}")
                            }
                        })
                    }
                    "/v1/devices/register" -> MockResponse().setResponseCode(201).setBody("{\"deviceId\":\"recovered-device\",\"token\":\"recovered-development-token\",\"tokenType\":\"bearer\"}")
                    else -> MockResponse().setResponseCode(404)
                }
            }
        }
        server.start()
        try {
            val client = LecsyncApiClient(context, AiServiceConfig(context).also { it.save(server.url("/").toString()) })
            store.save(DeviceCredential("stale-device", "stale-development-token"))
            val stream = client.openRealtime(
                RealtimeConfig(RealtimeTranscribeConfig(listOf("en", "zh"))),
                object : LecsyncApiClient.Listener {
                    override fun onEvent(text: String) {
                        if (text.contains("session.ready")) ready.countDown()
                    }
                    override fun onError(error: Throwable) = Unit
                    override fun onClosed(code: Int, reason: String) = Unit
                },
            )
            assertTrue(ready.await(5, TimeUnit.SECONDS))
            assertTrue(stream.control("session.stop"))
            stream.close()
            assertEquals(listOf("/v2/lecsync/realtime", "/v1/devices/register", "/v2/lecsync/realtime"), paths)
        } finally {
            store.clear()
            server.shutdown()
        }
    }
}
