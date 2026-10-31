package com.classroomradar.app.learning.api

private val CHINA_MOBILE = Regex("^1[3-9]\\d{9}$")

/** Accepts spaces, dashes, +86 and 0086 prefixes, then returns a bare 11-digit number. */
internal fun normalizeAccountPhone(raw: String): String? {
    var digits = raw.filter(Char::isDigit)
    digits = when {
        digits.startsWith("0086") && digits.length == 15 -> digits.drop(4)
        digits.startsWith("86") && digits.length == 13 -> digits.drop(2)
        else -> digits
    }
    return digits.takeIf(CHINA_MOBILE::matches)
}
