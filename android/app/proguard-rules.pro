# ProGuard / R8 Rules for ENCTXT Android

# Keep Kotlinx Serialization Models & Serializers
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * {
    @kotlinx.serialization.Serializable <fields>;
}
-keepclassmembers class * {
    public static *** Companion;
}
-keepclassmembers class * {
    public static *** serializer(...);
}
-keep class com.enctxt.data.model.** { *; }
-keep class com.enctxt.core.security.** { *; }
-keep class com.enctxt.core.gesture.** { *; }

# Keep Room Database Entities & DAOs
-keep class androidx.room.** { *; }
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-keep @androidx.room.Dao interface * { *; }

# Keep Bouncy Castle Providers
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# Keep OkHttp & WebSocket Internals
-keepattributes Signature
-keepattributes *Annotation*
-keepclassmembers class okhttp3.internal.publicsuffix.PublicSuffixDatabase {
    public java.lang.String[] getEffectiveTldPlusOne(java.lang.String);
}
-dontwarn okhttp3.**
-dontwarn okio.**

# Google Tink (transitive dependency of androidx.security:security-crypto, used by
# EncryptedGestureStorage for the Layer 3 gesture reveal templates). Tink references
# com.google.errorprone.annotations.* (CanIgnoreReturnValue, CheckReturnValue, Immutable,
# RestrictedApi) as compile-time-only annotations that aren't bundled at runtime and aren't
# used reflectively, so R8 can safely ignore their absence.
-dontwarn com.google.errorprone.annotations.**
