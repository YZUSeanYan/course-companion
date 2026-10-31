package com.classroomradar.app.learning

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class CourseDetailKeyTest {
    @Test
    fun materialAndLearningItemWithSameDatabaseIdHaveDistinctKeys() {
        assertEquals("material-1", courseDetailItemKey("material", 1))
        assertEquals("learning-1", courseDetailItemKey("learning", 1))
        assertNotEquals(
            courseDetailItemKey("material", 1),
            courseDetailItemKey("learning", 1),
        )
    }
}
