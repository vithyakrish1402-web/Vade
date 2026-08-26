# ProGuard / R8 Rules for ENCTXT Android

# Keep Kotlinx Serialization Models
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * {
    @kotlinx.serialization.Serializable <fields>;
}
-keep class com.enctxt.data.model.** { *; }

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
