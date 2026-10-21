package com.nextgenanime

object LanguageFilter {
    private fun word(vararg w: String) =
        Regex("\\b(" + w.joinToString("|") + ")\\b", RegexOption.IGNORE_CASE)

    private val ENGLISH = word("english")
    private val JAPANESE = word("japanese")
    private val MULTI = word("multi", "multi-dub", "multi dub")

    private val OTHER = word(
        "hindi", "telugu", "tamil", "malayalam", "kannada", "bengali", "bangla", "marathi", "gujarati",
        "punjabi", "urdu", "nepali", "spanish", "latino", "portuguese", "french", "german", "italian",
        "russian", "ukrainian", "polish", "dutch", "turkish", "arabic", "persian", "hebrew", "indonesian",
        "malay", "thai", "vietnamese", "filipino", "tagalog", "korean", "chinese", "mandarin", "cantonese",
    )

    fun allows(stream: NextGenStream): Boolean {
        val wantEnglish = NextGenStore.langEnglish
        val wantMulti = NextGenStore.langMultiDub
        val wantJapanese = NextGenStore.langJapanese
        if (!wantEnglish && !wantMulti && !wantJapanese) return true

        val text = listOfNotNull(stream.name, stream.title, stream.language).joinToString(" ")
        val english = ENGLISH.containsMatchIn(text)
        val japanese = JAPANESE.containsMatchIn(text)
        val multi = MULTI.containsMatchIn(text) || OTHER.containsMatchIn(text)
        if (!english && !japanese && !multi) return wantMulti

        return (wantEnglish && english) || (wantJapanese && japanese) || (wantMulti && multi)
    }
}
