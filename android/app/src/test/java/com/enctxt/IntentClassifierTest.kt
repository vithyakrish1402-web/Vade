package com.enctxt

import com.enctxt.core.privacy.IntentCategory
import com.enctxt.core.privacy.IntentClassifier
import org.junit.Assert.*
import org.junit.Test

class IntentClassifierTest {

    @Test
    fun testEmptyStringIsGeneral() {
        assertEquals(IntentCategory.GENERAL, IntentClassifier.classify(""))
    }

    @Test
    fun testClassifiesUrgent() {
        assertEquals(IntentCategory.URGENT, IntentClassifier.classify("This is urgent, please respond now!!"))
        assertEquals(IntentCategory.URGENT, IntentClassifier.classify("emergency!!!"))
    }

    @Test
    fun testClassifiesQuestion() {
        assertEquals(IntentCategory.QUESTION, IntentClassifier.classify("Are you coming tonight?"))
        assertEquals(IntentCategory.QUESTION, IntentClassifier.classify("How are you"))
    }

    @Test
    fun testClassifiesTime() {
        assertEquals(IntentCategory.TIME, IntentClassifier.classify("Let's meet tomorrow morning"))
        assertEquals(IntentCategory.TIME, IntentClassifier.classify("See you at 8pm"))
    }

    @Test
    fun testClassifiesLocation() {
        assertEquals(IntentCategory.LOCATION, IntentClassifier.classify("Meet me at the station"))
    }

    @Test
    fun testClassifiesRequest() {
        assertEquals(IntentCategory.REQUEST, IntentClassifier.classify("Please send the file"))
        assertEquals(IntentCategory.QUESTION, IntentClassifier.classify("Could you help with this"))
    }

    @Test
    fun testClassifiesNegation() {
        assertEquals(IntentCategory.NEGATION, IntentClassifier.classify("No, I don't think so"))
    }

    @Test
    fun testClassifiesAffirmation() {
        assertEquals(IntentCategory.AFFIRMATION, IntentClassifier.classify("Yes, sounds good"))
    }

    @Test
    fun testClassifiesGreeting() {
        assertEquals(IntentCategory.GREETING, IntentClassifier.classify("Hello there"))
        assertEquals(IntentCategory.GREETING, IntentClassifier.classify("Good morning!"))
    }

    @Test
    fun testClassifiesFarewell() {
        assertEquals(IntentCategory.FAREWELL, IntentClassifier.classify("Bye, take care"))
    }

    @Test
    fun testClassifiesAcknowledgement() {
        assertEquals(IntentCategory.ACKNOWLEDGEMENT, IntentClassifier.classify("Got it, thanks"))
    }

    @Test
    fun testFallsBackToGeneral() {
        assertEquals(IntentCategory.GENERAL, IntentClassifier.classify("The quarterly report numbers look fine"))
    }

    @Test
    fun testIsDeterministic() {
        val input = "Meet me at the station tomorrow at 8pm, urgent!!"
        assertEquals(IntentClassifier.classify(input), IntentClassifier.classify(input))
    }

    @Test
    fun testNeverThrowsOnUnusualInput() {
        IntentClassifier.classify("😊".repeat(50))
        IntentClassifier.classify("你好，世界！")
    }
}
