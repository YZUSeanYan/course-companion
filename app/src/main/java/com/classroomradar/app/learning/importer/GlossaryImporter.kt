package com.classroomradar.app.learning.importer

data class GlossaryEntry(val term: String, val definition: String)

object GlossaryImporter {
    fun parse(text: String): List<GlossaryEntry> {
        val entries = linkedMapOf<String, GlossaryEntry>()
        text.lineSequence().forEachIndexed { index, raw ->
            val line = raw.trim()
            if (line.isBlank()) return@forEachIndexed
            val parts = if (line.contains('\t')) line.split('\t') else line.split(',', limit = 2)
            if (index == 0 && parts.firstOrNull()?.trim()?.lowercase() in setOf("term", "word", "单词", "词汇")) {
                return@forEachIndexed
            }
            require(parts.size >= 2) { "第 ${index + 1} 行缺少释义，请使用“单词,释义”或 TSV" }
            val term = parts[0].trim()
            val definition = parts.drop(1).joinToString(",").trim().removePrefix("\"").removeSuffix("\"")
            if (term.isBlank() || definition.isBlank()) return@forEachIndexed
            require(term.length <= 120 && definition.length <= 1000) { "第 ${index + 1} 行内容过长" }
            entries.putIfAbsent(term.lowercase(), GlossaryEntry(term, definition))
        }
        require(entries.isNotEmpty()) { "词表没有有效词条" }
        require(entries.size <= 5000) { "单次最多导入 5000 个词条" }
        return entries.values.toList()
    }
}
