package com.classroomradar.app.learning.api

private const val MAX_SOURCE_IDS = 20
private val SHA_256 = Regex("^[0-9a-f]{64}$")

internal fun validateAnalyzeRequest(request: AnalyzeRequest) {
    requireRequestText(request.courseName, "courseName", 200)
    requireRequestText(request.language, "language", 50)
    requireRequest(request.glossary.size <= 100, "glossary has more than 100 items")
    request.glossary.forEachIndexed { index, item ->
        requireRequestText(item.term, "glossary[$index].term", 120)
        item.definition?.let {
            requireRequest(it.length <= 1000, "glossary[$index].definition is too long")
        }
    }

    requireRequest(request.chunks.isNotEmpty(), "chunks must not be empty")
    requireRequest(request.chunks.size <= 100, "chunks has more than 100 items")
    requireRequest(
        request.chunks.sumOf { it.text.length.toLong() } <= 200_000L,
        "combined chunk text has more than 200000 characters",
    )
    request.chunks.forEachIndexed { index, chunk ->
        requireRequestText(chunk.sourceId, "chunks[$index].sourceId", 100)
        requireRequestText(chunk.text, "chunks[$index].text", 20_000)
        chunk.page?.let {
            requireRequest(it in 1..100_000, "chunks[$index].page is out of range")
        }
        requireRequest(
            (chunk.startMs == null) == (chunk.endMs == null),
            "chunks[$index].startMs and endMs must be provided together",
        )
        chunk.startMs?.let {
            requireRequest(it >= 0L, "chunks[$index].startMs must not be negative")
        }
        chunk.endMs?.let {
            requireRequest(it >= 0L, "chunks[$index].endMs must not be negative")
        }
        if (chunk.startMs != null && chunk.endMs != null) {
            requireRequest(
                chunk.endMs > chunk.startMs,
                "chunks[$index].endMs must be greater than startMs",
            )
        }
    }
    requireRequest(
        request.chunks.map { it.sourceId }.distinct().size == request.chunks.size,
        "chunk sourceId values must be unique",
    )

    requireRequest(request.requestedOutputs.isNotEmpty(), "requestedOutputs must not be empty")
    requireRequest(request.requestedOutputs.size <= 6, "requestedOutputs has more than 6 items")
    requireRequest(
        request.requestedOutputs.distinct().size == request.requestedOutputs.size,
        "requestedOutputs values must be unique",
    )
}

internal fun validateAnalysisResponse(response: AnalysisEnvelope, request: AnalyzeRequest) {
    requireResponseText(response.analysisId, "analysisId")
    requireResponse(SHA_256.matches(response.inputSha256), "inputSha256 must be 64 lowercase hex characters")
    requireResponseText(response.promptVersion, "promptVersion")
    requireResponseText(response.schemaVersion, "schemaVersion")
    requireResponseText(response.model, "model")

    val learningPackage = response.`package`
    val validSources = request.chunks.mapTo(mutableSetOf()) { it.sourceId }
    validateRequestedOutputs(learningPackage, request.requestedOutputs.toSet())

    requireResponse(learningPackage.summary.size <= 8, "package.summary has more than 8 items")
    learningPackage.summary.forEachIndexed { index, item ->
        requireResponseText(item.text, "package.summary[$index].text", 2_000)
        validateSources(item.sourceIds, "package.summary[$index].sourceIds", validSources)
    }

    requireResponse(learningPackage.vocabulary.size <= 30, "package.vocabulary has more than 30 items")
    learningPackage.vocabulary.forEachIndexed { index, item ->
        val path = "package.vocabulary[$index]"
        requireResponseText(item.term, "$path.term", 120)
        requireResponseText(item.definitionZh, "$path.definitionZh", 1_000)
        requireResponseText(item.definitionEn, "$path.definitionEn", 1_000)
        requireResponseText(item.example, "$path.example", 1_500)
        validateSources(item.sourceIds, "$path.sourceIds", validSources)
    }

    requireResponse(learningPackage.phrases.size <= 30, "package.phrases has more than 30 items")
    learningPackage.phrases.forEachIndexed { index, item ->
        val path = "package.phrases[$index]"
        requireResponseText(item.phrase, "$path.phrase", 200)
        requireResponseText(item.definitionZh, "$path.definitionZh", 1_000)
        requireResponseText(item.definitionEn, "$path.definitionEn", 1_000)
        requireResponseText(item.example, "$path.example", 1_500)
        validateSources(item.sourceIds, "$path.sourceIds", validSources)
    }

    requireResponse(learningPackage.keyPoints.size <= 20, "package.keyPoints has more than 20 items")
    learningPackage.keyPoints.forEachIndexed { index, item ->
        requireResponseText(item.text, "package.keyPoints[$index].text", 2_000)
        validateSources(item.sourceIds, "package.keyPoints[$index].sourceIds", validSources)
    }

    requireResponse(learningPackage.questions.size <= 20, "package.questions has more than 20 items")
    learningPackage.questions.forEachIndexed { index, item ->
        val path = "package.questions[$index]"
        requireResponseText(item.question, "$path.question", 1_000)
        requireResponseText(item.answer, "$path.answer", 2_000)
        validateSources(item.sourceIds, "$path.sourceIds", validSources)
    }

    requireResponse(learningPackage.quizCards.size <= 30, "package.quizCards has more than 30 items")
    learningPackage.quizCards.forEachIndexed { index, item ->
        val path = "package.quizCards[$index]"
        requireResponseText(item.front, "$path.front", 1_000)
        requireResponseText(item.back, "$path.back", 2_000)
        validateSources(item.sourceIds, "$path.sourceIds", validSources)
    }
}

private fun validateRequestedOutputs(
    learningPackage: LearningPackage,
    requested: Set<RequestedOutput>,
) {
    val outputs = mapOf(
        RequestedOutput.SUMMARY to learningPackage.summary,
        RequestedOutput.VOCABULARY to learningPackage.vocabulary,
        RequestedOutput.PHRASES to learningPackage.phrases,
        RequestedOutput.KEY_POINTS to learningPackage.keyPoints,
        RequestedOutput.QUESTIONS to learningPackage.questions,
        RequestedOutput.QUIZ_CARDS to learningPackage.quizCards,
    )
    outputs.forEach { (output, items) ->
        if (output in requested) {
            requireResponse(items.isNotEmpty(), "requested output ${output.wireName} is empty")
        } else {
            requireResponse(items.isEmpty(), "unrequested output ${output.wireName} is not empty")
        }
    }
}

private fun validateSources(
    sourceIds: List<String>,
    path: String,
    validSources: Set<String>,
) {
    requireResponse(sourceIds.isNotEmpty(), "$path must not be empty")
    requireResponse(sourceIds.size <= MAX_SOURCE_IDS, "$path has more than 20 items")
    requireResponse(sourceIds.distinct().size == sourceIds.size, "$path values must be unique")
    sourceIds.forEachIndexed { index, sourceId ->
        requireResponse(sourceId.isNotBlank(), "$path[$index] must not be empty")
        requireResponse(sourceId in validSources, "$path[$index] is absent from request chunks")
    }
}

private fun requireRequestText(value: String, path: String, maxLength: Int) {
    requireRequest(value.isNotBlank(), "$path must not be empty")
    requireRequest(value.length <= maxLength, "$path is too long")
}

private fun requireResponseText(value: String, path: String, maxLength: Int = Int.MAX_VALUE) {
    requireResponse(value.isNotBlank(), "$path must not be empty")
    requireResponse(value.length <= maxLength, "$path is too long")
}

private fun requireRequest(condition: Boolean, detail: String) {
    if (!condition) throw LearningApiException.InvalidRequest(detail)
}

private fun requireResponse(condition: Boolean, detail: String) {
    if (!condition) throw LearningApiException.InvalidResponse("Analysis", detail)
}
