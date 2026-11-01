package com.classroomradar.app.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Keeps the in-app latency readout aligned with the official 0.28s / ~88ms figures. */
class RealtimeLatencyTrackerTest {
    @Test
    fun `measures recognition latency from newest sent audio`() {
        val tracker = RealtimeLatencyTracker()
        assertNull(tracker.onPartial(nowMs = 500))
        tracker.onAudioSent(nowMs = 1_000)
        assertEquals(280L, tracker.onPartial(nowMs = 1_280))
        tracker.onAudioSent(nowMs = 1_500)
        assertEquals(90L, tracker.onPartial(nowMs = 1_590))
        assertEquals(232L, tracker.recognitionLatencyMs) // EMA of 280 and 90
    }

    @Test
    fun `ignores stale or impossible recognition lags`() {
        val tracker = RealtimeLatencyTracker()
        tracker.onAudioSent(nowMs = 1_000)
        assertNull(tracker.onPartial(nowMs = 1_000 - 500)) // negative
        assertNull(tracker.onPartial(nowMs = 1_000 + 6_000)) // beyond 5s window
        assertEquals(0L, tracker.recognitionLatencyMs)
        assertEquals(120L, tracker.onPartial(nowMs = 1_120))
    }

    @Test
    fun `translation partial lags the latest transcript event`() {
        val tracker = RealtimeLatencyTracker()
        assertNull(tracker.onTranslationPartial(nowMs = 5_000))
        tracker.onPartial(nowMs = 5_000)
        assertEquals(88L, tracker.onTranslationPartial(nowMs = 5_088))
        assertNull(tracker.onTranslationPartial(nowMs = 5_088 + 3_000)) // beyond window
    }

    @Test
    fun `translation final measures per segment and resets per stream`() {
        val tracker = RealtimeLatencyTracker()
        assertNull(tracker.onTranslationFinal("s1", nowMs = 9_000))
        tracker.onFinal("s1", nowMs = 9_000)
        assertEquals(640L, tracker.onTranslationFinal("s1", nowMs = 9_640))
        assertNull(tracker.onTranslationFinal("s1", nowMs = 9_700)) // consumed once
        tracker.onFinal("s2", nowMs = 10_000)
        tracker.resetStream()
        assertNull(tracker.onTranslationFinal("s2", nowMs = 10_100))
    }
}
