package com.classroomradar.app.audio

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The reconnect set must stay aligned with the official Lecsync retryable close
 * codes plus this gateway's own contract codes, so a weak-network class recovers
 * exactly where the official client would.
 */
class RealtimeCloseCodesTest {
    @Test
    fun `reconnect codes cover official retryable set and gateway contract`() {
        assertEquals(
            setOf(
                4001, // official: token invalid or expired
                4004, // official: session not on this node
                4010, // official: balance exhausted, retry after payment
                4011, // official: concurrency full, retry after wait
                4012, // official: max duration reached, open a new stream
                4013, // official: idle timeout, 60s without audio
                4016, // official: client reading too slowly
                1012, // official: gateway restarting
                4401, // gateway: authentication required
                4408, // gateway: legacy class boundary code
            ),
            REALTIME_RECONNECT_CLOSE_CODES,
        )
    }
}
