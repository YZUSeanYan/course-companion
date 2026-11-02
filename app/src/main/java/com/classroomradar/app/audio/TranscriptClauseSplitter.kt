package com.classroomradar.app.audio

/**
 * Splits a long ASR final into subtitle-sized clauses before it is persisted.
 *
 * Cloud "sentence" mode hands back a whole paragraph as one final, and a lecturer
 * who never pauses produces one run-on sentence. Every persisted transcript row is
 * rendered as its own subtitle card, so splitting here keeps the reading rhythm
 * short without waiting for the upstream service to change. The matching
 * translation is split with the same source parts, which keeps each card bilingual.
 */
internal object TranscriptClauseSplitter {
    /** Target upper bound of one subtitle: ~8 English words or ~16 CJK characters. */
    private const val MAX_UNITS = 16

    /** A sentence longer than this gets split at clause boundaries. */
    private const val SPLIT_AT_UNITS = 20

    /** Fragments smaller than this are merged into a neighbour instead of standing alone. */
    private const val TINY_UNITS = 4

    /** Safety valve for pathological inputs; lasts parts are merged, never dropped. */
    private const val MAX_PARTS = 8

    private val sentenceEnders = charArrayOf('.', '!', '?', '。', '！', '？', '；', ';', '…')
    private val sentenceClosers = "”\"'’）)】]」』".toSet()
    private val abbreviations = setOf(
        "mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "e.g", "i.e", "a.m", "p.m", "u.s", "u.k",
    )
    private val englishBreakers = listOf(
        " because ", " so ", " and ", " but ", " which ", " when ", " while ", " although ",
        " though ", " that ", " if ", " or ", " then ", " where ", " after ", " before ",
    )
    private val chineseBreakers = listOf(
        "因为", "所以", "但是", "可是", "而且", "并且", "如果", "虽然", "然后", "因此",
        "不过", "而是", "于是", "同时",
    )
    private val clauseMarks = charArrayOf(',', '，', '、', ':', '：')

    /** Splits [text] into ordered clauses; returns the trimmed input when it is already short. */
    fun split(text: String): List<String> {
        val normalized = text.replace(Regex("\\s+"), " ").trim()
        if (normalized.isEmpty()) return emptyList()
        val pieces = mutableListOf<String>()
        splitSentences(normalized).forEach { sentence ->
            if (units(sentence) <= SPLIT_AT_UNITS) {
                pieces += sentence
            } else {
                pieces += splitLongPiece(sentence)
            }
        }
        val merged = mergeTiny(pieces.filter { it.isNotBlank() })
        return if (merged.size <= MAX_PARTS) merged else mergeToLimit(merged)
    }

    /**
     * Splits a translated segment into exactly [count] parts so each persisted
     * source clause receives its own translation. Sentence and clause punctuation
     * are tried first (they normally mirror the source); a proportional cut is the
     * last resort.
     */
    fun splitTranslation(text: String, count: Int, sources: List<String>): List<String> {
        val normalized = text.trim()
        if (count <= 1) return listOf(normalized)
        if (normalized.isEmpty()) return List(count) { "" }
        val sentences = splitSentences(normalized).filter { it.isNotBlank() }
        if (sentences.size == count) return sentences
        val clauses = splitAtPunctuation(normalized)
        if (clauses.size == count) return clauses
        return proportionalCut(normalized, count, sources)
    }

    private fun splitSentences(text: String): List<String> {
        val result = mutableListOf<String>()
        var start = 0
        var index = 0
        while (index < text.length) {
            val ch = text[index]
            if (ch in sentenceEnders && isSentenceBoundary(text, index)) {
                var end = index + 1
                // Ellipsis is often written as "..." — consume the run as one boundary.
                while (end < text.length && text[end] == ch) end += 1
                while (end < text.length && (text[end] in sentenceClosers || text[end] == ' ')) end += 1
                val piece = text.substring(start, end).trim()
                if (piece.isNotEmpty()) result += piece
                start = end
                index = end
            } else {
                index += 1
            }
        }
        if (start < text.length) {
            val tail = text.substring(start).trim()
            if (tail.isNotEmpty()) result += tail
        }
        return result
    }

    private fun isSentenceBoundary(text: String, index: Int): Boolean {
        val ch = text[index]
        if (ch == '.') {
            val previous = previousWord(text, index)
            if (previous.length == 1 && previous[0].isLetter()) return false
            if (previous.lowercase() in abbreviations) return false
            val next = text.getOrNull(index + 1)
            val before = text.getOrNull(index - 1)
            if (next?.isDigit() == true && before?.isDigit() == true) return false
            // "3.14" and "v2.0.8" are not sentence ends.
            if (before?.isDigit() == true) return false
        }
        return true
    }

    private fun previousWord(text: String, index: Int): String {
        var cursor = index
        while (cursor > 0 && !text[cursor - 1].isWhitespace()) cursor -= 1
        return text.substring(cursor, index).trim(',' , ';', ':', '(', '[', '"', '\'')
    }

    private fun splitLongPiece(piece: String): List<String> {
        val byClause = splitAtClauseMarks(piece)
        val fragments = if (byClause.size > 1) byClause else splitAtBreakers(piece)
        val bounded = mutableListOf<String>()
        fragments.forEach { fragment ->
            if (units(fragment) <= MAX_UNITS) bounded += fragment else bounded += splitAtWidth(fragment)
        }
        return mergeTiny(bounded)
    }

    private fun splitAtClauseMarks(text: String): List<String> {
        val result = mutableListOf<String>()
        var start = 0
        var index = 0
        while (index < text.length) {
            if (text[index] in clauseMarks) {
                var end = index + 1
                while (end < text.length && text[end] == ' ') end += 1
                val piece = text.substring(start, end).trim()
                if (piece.isNotEmpty()) result += piece
                start = end
                index = end
            } else {
                index += 1
            }
        }
        if (start < text.length) {
            val tail = text.substring(start).trim()
            if (tail.isNotEmpty()) result += tail
        }
        return result
    }

    private fun splitAtBreakers(text: String): List<String> {
        val lower = text.lowercase()
        val cuts = mutableListOf<Int>()
        englishBreakers.forEach { breaker ->
            var from = 0
            while (true) {
                val at = lower.indexOf(breaker, from)
                if (at < 0) break
                cuts += at + 1 // keep the leading space with the next clause
                from = at + breaker.length
            }
        }
        chineseBreakers.forEach { breaker ->
            var from = 0
            while (true) {
                val at = text.indexOf(breaker, from)
                if (at < 0) break
                cuts += at
                from = at + breaker.length
            }
        }
        if (cuts.isEmpty()) return listOf(text)
        val sorted = cuts.filter { it in 1 until text.length }.distinct().sorted()
        if (sorted.isEmpty()) return listOf(text)
        val result = mutableListOf<String>()
        var start = 0
        sorted.forEach { cut ->
            val piece = text.substring(start, cut).trim()
            if (piece.isNotEmpty()) result += piece
            start = cut
        }
        val tail = text.substring(start).trim()
        if (tail.isNotEmpty()) result += tail
        return result
    }

    private fun splitAtWidth(text: String): List<String> {
        val result = mutableListOf<String>()
        var remaining = text.trim()
        while (units(remaining) > MAX_UNITS && remaining.isNotEmpty()) {
            var cursor = 0
            var unitCount = 0
            var inWord = false
            var cut = -1
            while (cursor < remaining.length && unitCount <= MAX_UNITS) {
                val ch = remaining[cursor]
                when {
                    isCjk(ch) -> {
                        unitCount += 1
                        inWord = false
                        if (unitCount >= MAX_UNITS) cut = cursor + 1
                    }
                    ch.isLetterOrDigit() -> {
                        if (!inWord) {
                            unitCount += 2
                            inWord = true
                        }
                        if (unitCount >= MAX_UNITS) cut = cursor + 1
                    }
                    ch.isWhitespace() -> {
                        inWord = false
                        cut = cursor + 1
                    }
                    else -> inWord = false
                }
                cursor += 1
            }
            if (cut <= 0 || cut >= remaining.length) cut = cursor.coerceAtLeast(1)
            cut = avoidMidWord(remaining, cut)
            val piece = remaining.substring(0, cut).trim()
            if (piece.isNotEmpty()) result += piece
            remaining = remaining.substring(cut).trim()
            if (result.size >= MAX_PARTS) break
        }
        if (remaining.isNotEmpty()) result += remaining
        return result
    }

    /** Keeps a hard cut on a word boundary when the width limit lands inside an English word. */
    private fun avoidMidWord(text: String, cut: Int): Int {
        if (cut <= 0 || cut >= text.length) return cut
        if (!text[cut - 1].isLatinWordChar() || !text[cut].isLatinWordChar()) return cut
        var index = cut - 1
        while (index > 0 && !text[index - 1].isWhitespace()) index -= 1
        return if (index > 0) index else cut
    }

    private fun splitAtPunctuation(text: String): List<String> {        val result = mutableListOf<String>()
        var start = 0
        var index = 0
        while (index < text.length) {
            val ch = text[index]
            if (ch in sentenceEnders || ch in clauseMarks) {
                var end = index + 1
                while (end < text.length && (text[end] in sentenceClosers || text[end] == ' ')) end += 1
                val piece = text.substring(start, end).trim()
                if (piece.any { it.isLetterOrDigit() || isCjk(it) }) result += piece
                start = end
                index = end
            } else {
                index += 1
            }
        }
        if (start < text.length) {
            val tail = text.substring(start).trim()
            if (tail.isNotEmpty()) result += tail
        }
        return result
    }

    private fun proportionalCut(text: String, count: Int, sources: List<String>): List<String> {
        val weights = List(count) { index -> sources.getOrNull(index)?.length?.coerceAtLeast(1) ?: 1 }
        val total = weights.sum().toFloat()
        val parts = mutableListOf<String>()
        var cursor = 0
        var accumulated = 0f
        for (index in 0 until count - 1) {
            accumulated += weights[index]
            val target = (text.length * accumulated / total).toInt()
            val minCut = cursor + 1
            val maxCut = text.length - (count - 1 - index)
            val window = maxOf(2, text.length / (count * 4))
            var cut = target.coerceIn(minCut, maxCut)
            var offset = 0
            while (offset <= window) {
                val left = target - offset
                if (left in minCut..maxCut && text[left - 1].isBreakFriendly()) {
                    cut = left
                    break
                }
                val right = target + offset
                if (right in minCut..maxCut && text[right - 1].isBreakFriendly()) {
                    cut = right
                    break
                }
                offset += 1
            }
            parts += text.substring(cursor, cut).trim()
            cursor = cut
        }
        parts += text.substring(cursor).trim()
        return parts
    }

    private fun mergeTiny(parts: List<String>): List<String> {
        val result = mutableListOf<String>()
        parts.forEach { part ->
            val previous = result.lastOrNull()
            if (previous != null && (units(part) < TINY_UNITS || units(previous) < TINY_UNITS) &&
                units(previous) + units(part) <= SPLIT_AT_UNITS
            ) {
                result[result.lastIndex] = join(previous, part)
            } else {
                result += part
            }
        }
        return result
    }

    private fun mergeToLimit(parts: List<String>): List<String> {
        val result = parts.take(MAX_PARTS).toMutableList()
        parts.drop(MAX_PARTS).forEach { extra ->
            result[result.lastIndex] = join(result.last(), extra)
        }
        return result
    }

    private fun join(left: String, right: String): String {
        val leftChar = left.lastOrNull()
        val touchesCjk = leftChar?.let(::isCjk) == true ||
            right.firstOrNull()?.let(::isCjk) == true ||
            leftChar == '，' || leftChar == '。' || leftChar == '、' ||
            leftChar == '；' || leftChar == '：' || leftChar == '！' || leftChar == '？'
        return if (touchesCjk) left + right else "$left $right"
    }

    private fun units(text: String): Int {
        var cjk = 0
        var words = 0
        var inWord = false
        text.forEach { ch ->
            when {
                isCjk(ch) -> {
                    cjk += 1
                    inWord = false
                }
                ch.isLetterOrDigit() -> {
                    if (!inWord) {
                        words += 1
                        inWord = true
                    }
                }
                else -> inWord = false
            }
        }
        return cjk + words * 2
    }

    private fun isCjk(ch: Char): Boolean = ch in '\u4E00'..'\u9FFF' || ch in '\u3400'..'\u4DBF'

    private fun Char.isLatinWordChar(): Boolean = isLetterOrDigit() && !isCjk(this)

    private fun Char.isBreakFriendly(): Boolean =
        isWhitespace() || this in sentenceEnders || this in clauseMarks
}
