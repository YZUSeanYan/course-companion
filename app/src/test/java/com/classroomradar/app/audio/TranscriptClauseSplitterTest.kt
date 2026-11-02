package com.classroomradar.app.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TranscriptClauseSplitterTest {
    @Test
    fun sentenceGroupsBecomeOneCardPerSentence() {
        val parts = TranscriptClauseSplitter.split("How did he come doctor? There you go. Those are three.")
        assertEquals(listOf("How did he come doctor?", "There you go.", "Those are three."), parts)
    }

    @Test
    fun runOnSentenceSplitsAtConjunction() {
        val parts = TranscriptClauseSplitter.split("We also use it because it's closure for this one.")
        assertEquals(listOf("We also use it", "because it's closure for this one."), parts)
    }

    @Test
    fun screenshotSampleSplitsIntoShortCards() {
        assertEquals(
            listOf("Thank you.", "We also use it", "because it's closure for this one."),
            TranscriptClauseSplitter.split("Thank you. We also use it because it's closure for this one."),
        )
    }

    @Test
    fun shortFinalStaysIntact() {
        assertEquals(listOf("Okay."), TranscriptClauseSplitter.split("Okay."))
    }

    @Test
    fun abbreviationsAndDecimalsDoNotSplit() {
        assertEquals(
            listOf("Mr. Smith met at 3.14 pm."),
            TranscriptClauseSplitter.split("Mr. Smith met at 3.14 pm."),
        )
    }

    @Test
    fun chineseLongSentenceSplitsAtCommas() {
        val parts = TranscriptClauseSplitter.split("这个实验我们上周已经做过了，但是数据还没有整理完，所以今天先讨论一下理论部分。")
        assertTrue(parts.size >= 2)
        assertTrue(parts.all { it.isNotBlank() })
        assertTrue(parts.joinToString("").replace(" ", "") == "这个实验我们上周已经做过了，但是数据还没有整理完，所以今天先讨论一下理论部分。")
    }

    @Test
    fun tinySentenceMergesIntoNeighbour() {
        assertEquals(
            listOf("Yes. This is the main point."),
            TranscriptClauseSplitter.split("Yes. This is the main point."),
        )
    }

    @Test
    fun unpunctuatedEnglishNeverCutsInsideWords() {
        val text = "The quick brown fox jumps over the lazy dog and keeps running through the field until the sun goes down"
        val words = text.split(" ").toSet()
        TranscriptClauseSplitter.split(text).forEach { part ->
            assertTrue("cut inside word: $part", part.split(" ").all { it in words })
        }
    }

    @Test
    fun extremeInputKeepsAtMostEightPartsAndDropsNothing() {
        val text = (1..40).joinToString(" ") { "Sentence number $it is here." }
        val parts = TranscriptClauseSplitter.split(text)
        assertTrue(parts.size <= 8)
        assertEquals(text.replace(" ", ""), parts.joinToString(" ").replace(" ", ""))
    }

    @Test
    fun chineseParagraphSplitsAndKeepsText() {
        val text = "这节课讲车床的基本结构。主轴箱传递动力。进给箱改变进给量。溜板箱带动刀架。"
        val parts = TranscriptClauseSplitter.split(text)
        assertTrue(parts.size > 1)
        assertEquals(text, parts.joinToString(""))
    }

    @Test
    fun translationSplitsToRequestedCount() {
        val parts = TranscriptClauseSplitter.splitTranslation(
            "谢谢，我们也会用它，因为它是这个的闭合。",
            3,
            listOf("Thank you.", "We also use it", "because it's closure for this one."),
        )
        assertEquals(3, parts.size)
        assertEquals("谢谢，我们也会用它，因为它是这个的闭合。", parts.joinToString(""))
    }

    @Test
    fun translationCountIsAlwaysHonoured() {
        for (count in listOf(2, 3, 5)) {
            assertEquals(count, TranscriptClauseSplitter.splitTranslation("一二三四五六七八九十", count, emptyList()).size)
        }
    }

    @Test
    fun unpunctuatedLongSpeechStaysBounded() {
        val text = "the first thing we need to understand is that the process which was designed in the nineteen seventies no longer works for modern materials and we have to replace it"
        val parts = TranscriptClauseSplitter.split(text)
        assertTrue(parts.size >= 2)
        assertTrue(parts.size <= 8)
        assertTrue(parts.all { it.isNotBlank() })
        assertEquals(text.replace(" ", ""), parts.joinToString(" ").replace(" ", ""))
    }

    @Test
    fun translationSentenceSplitAlignsWithSource() {
        val parts = TranscriptClauseSplitter.splitTranslation(
            "他是怎么来的，医生？你懂了。那是三个。",
            3,
            listOf("How did he come doctor?", "There you go.", "Those are three."),
        )
        assertEquals(listOf("他是怎么来的，医生？", "你懂了。", "那是三个。"), parts)
    }

    @Test
    fun translationClauseSplitAlignsWithSource() {
        val parts = TranscriptClauseSplitter.splitTranslation(
            "谢谢。我们也会用它，因为它是这个的闭合。",
            2,
            listOf("Thank you.", "We also use it because it's closure for this one."),
        )
        assertEquals(listOf("谢谢。", "我们也会用它，因为它是这个的闭合。"), parts)
    }

    @Test
    fun translationWithoutPunctuationFallsBackToProportionalCut() {
        val parts = TranscriptClauseSplitter.splitTranslation("甲乙丙丁戊己", 3, listOf("aa", "bb", "cc"))
        assertEquals(listOf("甲乙", "丙丁", "戊己"), parts)
    }
}
