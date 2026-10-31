package com.classroomradar.app.learning

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.FormatQuote
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.QuestionAnswer
import androidx.compose.material.icons.outlined.Style
import androidx.compose.material.icons.outlined.Translate
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * 学习内容的分类。顺序同时决定课程页和复习页的展示顺序。
 * 这里只映射数据库中真实存在的类型，不为了凑分类而生成空内容。
 */
internal enum class LearningCategory(
    val type: String,
    val label: String,
    val description: String,
    val icon: ImageVector,
    val reviewable: Boolean,
) {
    MINUTES(
        type = LearningItemEntity.TYPE_MEETING_MINUTES,
        label = "课堂纪要",
        description = "本节课的主题、讲解与结论",
        icon = Icons.AutoMirrored.Outlined.MenuBook,
        reviewable = false,
    ),
    DOUBT(
        type = LearningItemEntity.TYPE_DOUBT,
        label = "我的疑问",
        description = "你标记的问题和 AI 参考解答",
        icon = Icons.AutoMirrored.Outlined.HelpOutline,
        reviewable = false,
    ),
    KEY_POINT(
        type = LearningItemEntity.TYPE_KEY_POINT,
        label = "重点与摘要",
        description = "课堂摘要、重难点和图像说明",
        icon = Icons.Outlined.Lightbulb,
        reviewable = false,
    ),
    VOCABULARY(
        type = LearningItemEntity.TYPE_VOCABULARY,
        label = "词汇",
        description = "专业词汇、中文释义与例句",
        icon = Icons.Outlined.Translate,
        reviewable = true,
    ),
    PHRASE(
        type = LearningItemEntity.TYPE_PHRASE,
        label = "短语",
        description = "常用表达与固定搭配",
        icon = Icons.Outlined.FormatQuote,
        reviewable = true,
    ),
    QUESTION(
        type = LearningItemEntity.TYPE_QUESTION,
        label = "自测问答",
        description = "先回忆，再看参考答案",
        icon = Icons.Outlined.QuestionAnswer,
        reviewable = true,
    ),
    QUIZ(
        type = LearningItemEntity.TYPE_QUIZ,
        label = "练习",
        description = "正反面练习卡片",
        icon = Icons.Outlined.EditNote,
        reviewable = true,
    ),
    ;

    companion object {
        fun fromType(type: String): LearningCategory? = entries.firstOrNull { it.type == type }
    }
}

internal data class LearningCategoryGroup(
    val type: String,
    val title: String,
    val description: String,
    val icon: ImageVector,
    val items: List<LearningItemEntity>,
)

/** 按固定顺序分组，未知类型排到最后，空分类不出现。 */
internal fun groupLearningItems(items: List<LearningItemEntity>): List<LearningCategoryGroup> {
    val byType = items.groupBy { it.type }
    val known = LearningCategory.entries.mapNotNull { category ->
        val group = byType[category.type]?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        LearningCategoryGroup(
            type = category.type,
            title = category.label,
            description = category.description,
            icon = category.icon,
            items = group,
        )
    }
    val knownTypes = LearningCategory.entries.mapTo(mutableSetOf()) { it.type }
    val others = byType
        .filterKeys { it !in knownTypes }
        .map { (type, group) ->
            LearningCategoryGroup(
                type = type,
                title = learningTypeLabel(type),
                description = "其他学习内容",
                icon = Icons.Outlined.Style,
                items = group,
            )
        }
        .sortedBy { it.type }
    return known + others
}

internal data class ReviewCategorySummary(
    val type: String,
    val label: String,
    val description: String,
    val icon: ImageVector,
    val total: Int,
    val due: Int,
    val nextDueAtMillis: Long?,
)

internal fun summarizeReviewCategories(
    entries: List<ReviewCardWithSource>,
    nowMillis: Long,
): List<ReviewCategorySummary> {
    val byType = entries.groupBy { it.itemType }
    fun summary(type: String, label: String, description: String, icon: ImageVector): ReviewCategorySummary? {
        val cards = byType[type]?.takeIf { it.isNotEmpty() } ?: return null
        return ReviewCategorySummary(
            type = type,
            label = label,
            description = description,
            icon = icon,
            total = cards.size,
            due = cards.count { it.card.dueAtMillis <= nowMillis },
            nextDueAtMillis = cards
                .filter { it.card.dueAtMillis > nowMillis }
                .minOfOrNull { it.card.dueAtMillis },
        )
    }
    val known = LearningCategory.entries
        .filter { it.reviewable }
        .mapNotNull { summary(it.type, it.label, it.description, it.icon) }
    val knownTypes = LearningCategory.entries.mapTo(mutableSetOf()) { it.type }
    val others = byType.keys
        .filter { it !in knownTypes }
        .sorted()
        .mapNotNull { type -> summary(type, learningTypeLabel(type), "其他复习卡片", Icons.Outlined.Style) }
    return known + others
}

internal fun learningTypeLabel(type: String): String = LearningCategory.fromType(type)?.label ?: "学习内容"
