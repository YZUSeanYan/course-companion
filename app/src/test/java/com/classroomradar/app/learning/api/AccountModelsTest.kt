package com.classroomradar.app.learning.api

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountModelsTest {
    private val json = Json { ignoreUnknownKeys = false }

    @Test
    fun decodesActivatedAccountStatus() {
        val status = json.decodeFromString(
            AccountStatusDto.serializer(),
            """
            {
              "activated": true,
              "required": true,
              "status": "active",
              "phoneMasked": "139****0001",
              "displayName": "测试同学",
              "validUntil": "2026-11-20",
              "limits": {
                "aiPacksPerDay": 5,
                "audioMinutesPerDay": 60,
                "textCharactersPerDay": 20000,
                "documentsPerDay": 5,
                "maxDevices": 3
              },
              "usage": {
                "date": "2026-10-31",
                "aiPacks": 2,
                "audioMinutes": 12.5,
                "textCharacters": 1200,
                "documents": 1
              }
            }
            """.trimIndent(),
        )
        assertTrue(status.activated)
        assertEquals("139****0001", status.phoneMasked)
        assertEquals(5, status.limits.aiPacksPerDay)
        assertEquals(12.5, status.usage.audioMinutes, 0.001)
        assertEquals("2026-10-31", status.usage.date)
    }

    @Test
    fun decodesUnactivatedAccountStatus() {
        val status = json.decodeFromString(
            AccountStatusDto.serializer(),
            """{"activated":false,"required":true,"status":"none"}""",
        )
        assertFalse(status.activated)
        assertTrue(status.required)
        assertEquals("", status.phoneMasked)
        assertEquals(0, status.limits.aiPacksPerDay)
    }

    @Test
    fun normalizesCommonPhoneFormats() {
        assertEquals("13900000001", normalizeAccountPhone("139 0000 0001"))
        assertEquals("13900000001", normalizeAccountPhone("+86 139-0000-0001"))
        assertEquals("13900000001", normalizeAccountPhone("008613900000001"))
        assertEquals("13900000001", normalizeAccountPhone("8613900000001"))
        assertNull(normalizeAccountPhone("12345"))
        assertNull(normalizeAccountPhone("23900000001"))
        assertNull(normalizeAccountPhone(""))
    }

    @Test
    fun decodesActivationCodeResponse() {
        val response = json.decodeFromString(
            ActivationCodeResponse.serializer(),
            """{"sent":true,"phoneMasked":"139****0001","cooldownSeconds":60}""",
        )
        assertTrue(response.sent)
        assertEquals("139****0001", response.phoneMasked)
        assertEquals(60, response.cooldownSeconds)
        val fallback = json.decodeFromString(
            ActivationCodeResponse.serializer(),
            """{"sent":false,"phoneMasked":"","cooldownSeconds":30}""",
        )
        assertFalse(fallback.sent)
        assertEquals(30, fallback.cooldownSeconds)
    }

    @Test
    fun activateRequestOmitsNullCode() {
        val wire = Json { explicitNulls = false; encodeDefaults = true }
        assertEquals(
            """{"phone":"13900000001"}""",
            wire.encodeToString(AccountActivateRequest.serializer(), AccountActivateRequest("13900000001")),
        )
        assertEquals(
            """{"phone":"13900000001","code":"246810"}""",
            wire.encodeToString(
                AccountActivateRequest.serializer(),
                AccountActivateRequest("13900000001", "246810"),
            ),
        )
    }

    @Test
    fun decodesAppConfigWithAnnouncementAndTaglines() {
        val config = json.decodeFromString(
            AppConfigDto.serializer(),
            """
            {
              "announcement": {"enabled": true, "title": "新版发布", "body": "知习 V2.0.5 上线"},
              "taglines": ["知行合一", "学而时习之，不亦说乎"]
            }
            """.trimIndent(),
        )
        assertTrue(config.announcement.enabled)
        assertEquals("新版发布", config.announcement.title)
        assertEquals(2, config.taglines.size)
        val empty = json.decodeFromString(
            AppConfigDto.serializer(),
            """{"announcement":{"enabled":false,"title":"","body":""},"taglines":[]}""",
        )
        assertFalse(empty.announcement.enabled)
        assertTrue(empty.taglines.isEmpty())
    }
}
