/**
 * friendlyError — map raw provider / Supabase / RPC error messages
 * to short, customer-safe Thai + English copy.
 *
 * Background: the audit found that backend errors leak verbatim to
 * `toast.error()` — users see jargon like "PROVIDER_BILLING_ERROR",
 * `OpenAI 401: Incorrect API key…`, and SQL-shaped messages
 * ("function consume_credits_for(uuid, …) does not exist"). This
 * file is the single funnel: every toast that displays a backend
 * error string should pipe it through `friendlyError()` first so
 * the user sees a localized, actionable message and the team
 * keeps the raw text in `console.error` for debugging.
 *
 * Pattern matching is intentionally cheap (regex) — we accept some
 * misses in exchange for never blocking the UI thread. Unrecognised
 * errors fall through to a generic "something went wrong" message
 * that's still better than the raw provider noise.
 *
 * Usage:
 *   import { friendlyError } from "@/lib/friendlyError";
 *   import { useLanguage } from "@/contexts/LanguageContext";
 *
 *   const { language } = useLanguage();
 *   try { … } catch (err) {
 *     console.error("[my-feature] raw error:", err);
 *     toast.error(friendlyError(err, language));
 *   }
 */

export type Lang = "en" | "th" | "ja" | "es" | "hi";

interface ErrorMapping {
  /** Pattern to test the raw error message against. */
  match: RegExp;
  th: string;
  en: string;
  ja: string;
  es: string;
  hi: string;
}

const MAPPINGS: ErrorMapping[] = [
  {
    match: /URL to Asset|URL must point directly to a|direct (?:MP4|MP3|PNG)|Received text\/html/i,
    th: "URL to Asset currently imports direct MP4, MP3, or PNG file URLs only. Paste the actual media file URL, not a YouTube, Instagram, or social page link.",
    en: "URL to Asset currently imports direct MP4, MP3, or PNG file URLs only. Paste the actual media file URL, not a YouTube, Instagram, or social page link.",
    ja: "URL to Asset currently imports direct MP4, MP3, or PNG file URLs only. Paste the actual media file URL, not a YouTube, Instagram, or social page link.",
    es: "URL to Asset currently imports direct MP4, MP3, or PNG file URLs only. Paste the actual media file URL, not a YouTube, Instagram, or social page link.",
    hi: "URL to Asset currently imports direct MP4, MP3, or PNG file URLs only. Paste the actual media file URL, not a YouTube, Instagram, or social page link.",
  },
  // ── Credit-system errors ────────────────────────────────────
  {
    match: /INSUFFICIENT_CREDITS|insufficient[\s_-]*credit/i,
    th: "เครดิตไม่พอ — เติมเครดิตหรืออัปเกรดแพ็กเกจก่อนครับ",
    en: "Not enough credits — please top up or upgrade your plan.",
    ja: "クレジットが不足しています。チャージするかプランをアップグレードしてください。",
    es: "Créditos insuficientes — recarga o mejora tu plan.",
    hi: "क्रेडिट कम हैं — कृपया टॉप-अप करें या अपना प्लान अपग्रेड करें।",
  },
  {
    match: /ElevenLabs quota exceeded|Quota exceeded|insufficient[\s_-]*(?:credits|quota)|not enough.*credits/i,
    th: "เครดิต ElevenLabs ไม่พอสำหรับวิดีโอนี้ ลองใช้วิดีโอที่สั้นลงหรือเติมเครดิต ElevenLabs ก่อนครับ",
    en: "ElevenLabs credits are not enough for this video. Use a shorter video or top up ElevenLabs credits.",
    ja: "この動画には ElevenLabs のクレジットが不足しています。短い動画を使うか、ElevenLabs クレジットを追加してください。",
    es: "Los créditos de ElevenLabs no alcanzan para este vídeo. Usa un vídeo más corto o recarga créditos de ElevenLabs.",
    hi: "इस वीडियो के लिए ElevenLabs क्रेडिट कम हैं। छोटा वीडियो उपयोग करें या ElevenLabs क्रेडिट टॉप-अप करें।",
  },
  {
    match: /PROVIDER_BILLING_ERROR|provider[\s_-]*bill|insufficient[\s_-]*balance/i,
    th: "ระบบ AI ผู้ให้บริการขัดข้องชั่วคราว ทีมงานกำลังแก้ไข",
    en: "The AI provider is temporarily unavailable. Our team is on it.",
    ja: "AI プロバイダーが一時的に利用できません。チームが対応中です。",
    es: "El proveedor de IA no está disponible temporalmente. Nuestro equipo lo está revisando.",
    hi: "AI प्रदाता अस्थायी रूप से उपलब्ध नहीं है। हमारी टीम इस पर काम कर रही है।",
  },
  {
    match: /function .*consume_credits|function .*grant_credits|relation .* does not exist/i,
    th: "ระบบเครดิตขัดข้อง — ทีมงานได้รับแจ้งแล้ว",
    en: "Credit system error — our team has been notified.",
    ja: "クレジットシステムで問題が発生しました。チームに通知済みです。",
    es: "Error en el sistema de créditos — nuestro equipo ha sido notificado.",
    hi: "क्रेडिट सिस्टम में त्रुटि — हमारी टीम को सूचित कर दिया गया है।",
  },
  {
    match: /Pricing configuration missing|pricing.*missing|credit_costs/i,
    th: "ยังไม่ได้ตั้งราคาสำหรับโมเดลนี้ ทีมงานกำลังแก้ไขครับ",
    en: "Pricing is not configured for this model yet. Our team is fixing it.",
    ja: "このモデルの料金設定がまだありません。チームが対応中です。",
    es: "Aún no se ha configurado el precio para este modelo. Nuestro equipo lo está arreglando.",
    hi: "इस मॉडल के लिए मूल्य निर्धारण अभी कॉन्फ़िगर नहीं किया गया है। हमारी टीम इसे ठीक कर रही है।",
  },

  // ── Auth / session ──────────────────────────────────────────
  {
    match: /Invalid login credentials|Email not confirmed|invalid_grant/i,
    th: "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ได้ยืนยันอีเมล",
    en: "Wrong email or password — or your email isn't verified yet.",
    ja: "メールアドレスまたはパスワードが正しくないか、メール確認が未完了です。",
    es: "Email o contraseña incorrectos — o tu email aún no está verificado.",
    hi: "गलत ईमेल या पासवर्ड — या आपका ईमेल अभी सत्यापित नहीं है।",
  },
  {
    match: /JWT.*expired|expired[\s_-]*session|refresh[\s_-]*token[\s_-]*not[\s_-]*found/i,
    th: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
    en: "Your session expired — please sign in again.",
    ja: "セッションの有効期限が切れました。もう一度ログインしてください。",
    es: "Tu sesión ha expirado — inicia sesión de nuevo.",
    hi: "आपका सेशन समाप्त हो गया है — कृपया फिर से साइन इन करें।",
  },
  {
    match: /User already registered|email[\s_-]*already/i,
    th: "อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน",
    en: "This email is already registered — try signing in instead.",
    ja: "このメールアドレスは登録済みです。ログインをお試しください。",
    es: "Este email ya está registrado — prueba a iniciar sesión.",
    hi: "यह ईमेल पहले से पंजीकृत है — साइन इन करके देखें।",
  },

  // ── Storage / RLS ───────────────────────────────────────────
  {
    match: /row[\s_-]*level[\s_-]*security|RLS|new row violates/i,
    th: "ไม่มีสิทธิ์ทำรายการนี้ — ลองออกจากระบบและเข้าใหม่",
    en: "You don't have permission for this action — try signing in again.",
    ja: "この操作の権限がありません。ログアウトして再ログインしてください。",
    es: "No tienes permiso para esta acción — vuelve a iniciar sesión.",
    hi: "इस क्रिया के लिए आपको अनुमति नहीं है — फिर से साइन इन करके देखें।",
  },
  {
    match: /Bucket not found|object not found|storage.*404/i,
    th: "ไฟล์ที่อ้างอิงหายไปแล้ว ลองอัปโหลดใหม่",
    en: "The referenced file is missing — try re-uploading.",
    ja: "参照ファイルが見つかりません。再アップロードしてください。",
    es: "El archivo referenciado no existe — vuelve a subirlo.",
    hi: "संदर्भित फ़ाइल नहीं मिली — फिर से अपलोड करें।",
  },
  {
    match: /file size|too large|exceeded.*size|413/i,
    th: "ไฟล์ใหญ่เกินกำหนด (สูงสุด 1GB)",
    en: "File too large (max 1 GB).",
    ja: "ファイルサイズが大きすぎます（最大 1GB）。",
    es: "Archivo demasiado grande (máx. 1 GB).",
    hi: "फ़ाइल बहुत बड़ी है (अधिकतम 1 GB)।",
  },

  // ── Provider auth / config ──────────────────────────────────
  {
    match: /OpenAI 401|api[\s_-]*key|unauthorized|401[\s_]/i,
    th: "ระบบ AI ขัดข้องชั่วคราว — ทีมงานกำลังแก้ไข",
    en: "AI service temporarily down — our team is on it.",
    ja: "AI サービスが一時的に利用できません。チームが対応中です。",
    es: "El servicio de IA está temporalmente caído — nuestro equipo lo está revisando.",
    hi: "AI सेवा अस्थायी रूप से बंद है — हमारी टीम इस पर काम कर रही है।",
  },
  {
    match: /model[^\n]*does not exist|do not have access to (?:it|the model)|model_not_found|model[^\n]*not (?:available|enabled|accessible)|invalid[^\n]*model id/i,
    th: "โมเดล AI ที่ตั้งไว้ไม่พร้อมใช้งานในขณะนี้ — อาจอยู่ระหว่าง rollout หรือ account ยังไม่ได้รับสิทธิ์ ลองอีกครั้งใน 5–15 นาที หากยังไม่ได้ติดต่อทีมงาน",
    en: "The configured AI model isn't available right now — it may be in staged rollout or your account doesn't have access yet. Try again in 5–15 minutes; contact support if it persists.",
    ja: "設定された AI モデルが現在利用できません。段階的なロールアウト中か、アカウントにアクセス権がない可能性があります。5〜15 分後に再試行し、続く場合はサポートにお問い合わせください。",
    es: "El modelo de IA configurado no está disponible ahora — puede estar en despliegue gradual o tu cuenta aún no tiene acceso. Inténtalo de nuevo en 5–15 minutos; contacta a soporte si persiste.",
    hi: "कॉन्फ़िगर किया गया AI मॉडल अभी उपलब्ध नहीं है — यह क्रमिक रोलआउट में हो सकता है या आपके खाते को अभी एक्सेस नहीं मिला है। 5–15 मिनट में फिर से प्रयास करें; यदि समस्या बनी रहे तो सपोर्ट से संपर्क करें।",
  },
  {
    match: /unknown parameter|unsupported parameter|parameter[^\n]*not supported|invalid[^\n]*parameter for (?:this )?model/i,
    th: "การตั้งค่าคำขอไม่เข้ากับโมเดล AI นี้ ทีมงานจะแก้ — รบกวนส่ง error message นี้ให้ทีมด้วย",
    en: "The request shape doesn't match this AI model. Our team will fix — please share this error message.",
    ja: "リクエスト形式がこの AI モデルと一致しません。チームが修正します。このエラーメッセージを共有してください。",
    es: "La forma de la petición no coincide con este modelo de IA. Nuestro equipo lo arreglará — comparte este mensaje de error.",
    hi: "अनुरोध का प्रारूप इस AI मॉडल से मेल नहीं खाता। हमारी टीम ठीक करेगी — कृपया यह त्रुटि संदेश साझा करें।",
  },
  {
    match: /Seedance rejected the reference media|verified real-human assets|asset:\/\/|real person|privacy-sensitive|PrivacyInformation|SensitiveContentDetected/i,
    th: "Seedance 2.0 ปฏิเสธภาพคนจริงใน route นี้ ถ้าต้องใช้คนจริงให้ใช้ asset ที่ยืนยันสิทธิ์แล้ว หรือเลือกโมเดล/ผู้ให้บริการอื่นครับ",
    en: "Seedance 2.0 blocked the real-person reference on this route. Use a verified real-human asset, or choose another model/provider.",
    ja: "Seedance 2.0 はこの経路で実在人物の参照画像をブロックしました。認証済みの人物アセットを使うか、別のモデル/プロバイダーを選んでください。",
    es: "Seedance 2.0 bloqueó la referencia de persona real en esta ruta. Usa un asset humano verificado o elige otro modelo/proveedor.",
    hi: "Seedance 2.0 ने इस मार्ग पर वास्तविक व्यक्ति का संदर्भ अवरुद्ध कर दिया। सत्यापित मानव एसेट उपयोग करें या कोई अन्य मॉडल/प्रदाता चुनें।",
  },
  {
    match: /Dubbing without a watermark.*Creator\+|watermark.*Creator\+|subscription_not_allowed|subscription_required|instant voice cloning|instant_voice_cloning|paid_plan_required/i,
    th: "บัญชี ElevenLabs ตอนนี้ยังไม่รองรับการทำ MP4 แบบไม่ติด watermark หรือ voice clone แบบนี้ กรุณาใช้ไฟล์เสียง MP3/Audio เป็นต้นฉบับ หรืออัปเกรด ElevenLabs เป็นแผนที่รองรับ",
    en: "This ElevenLabs account cannot create watermark-free MP4 dubbing or this voice-clone mode on the current plan. Use an MP3/audio source, or upgrade ElevenLabs to a supported plan.",
    ja: "現在の ElevenLabs プランでは、透かしなしの MP4 ダビングまたはこのボイスクローンモードを利用できません。MP3/音声ソースを使うか、対応プランへアップグレードしてください。",
  },
  {
    match: /content[\s_-]*polic|moderation|blocked|safety[\s_-]*system|disallowed/i,
    th: "เนื้อหาที่ขอนี้ผู้ให้บริการ AI ปฏิเสธ ลองปรับ prompt ให้ปลอดภัยกว่านี้",
    en: "The AI provider blocked this request — try a safer prompt.",
    ja: "AI プロバイダーがこのリクエストをブロックしました。より安全なプロンプトに調整してください。",
    es: "El proveedor de IA bloqueó esta petición — prueba con un prompt más seguro.",
    hi: "AI प्रदाता ने इस अनुरोध को ब्लॉक कर दिया — एक सुरक्षित प्रॉम्प्ट आज़माएँ।",
  },
  {
    match: /rate[\s_-]*limit|429|too many requests/i,
    th: "ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่",
    en: "Too many requests — please wait a moment and try again.",
    ja: "リクエストが多すぎます。少し待ってから再試行してください。",
    es: "Demasiadas peticiones — espera un momento y vuelve a intentarlo.",
    hi: "बहुत अधिक अनुरोध — कृपया कुछ देर रुककर फिर से प्रयास करें।",
  },
  {
    match: /Veo image input was rejected|inlineData.*isn'?t supported|imageBytes|models\/veo.*not found/i,
    th: "Veo 3.1 ยังรับรูปอ้างอิงไม่ได้ในตอนนี้ ลองสร้างแบบ Text to Video ก่อนครับ",
    en: "Veo 3.1 image input is unavailable right now. Try Text to Video first.",
    ja: "Veo 3.1 の画像入力は現在利用できません。まず Text to Video をお試しください。",
    es: "La entrada de imagen de Veo 3.1 no está disponible ahora. Prueba primero Text to Video.",
    hi: "Veo 3.1 का इमेज इनपुट अभी उपलब्ध नहीं है। पहले Text to Video आज़माएँ।",
  },
  {
    match: /Veo: failed to fetch start\/end frame \((?:400|401|403|404|410)\)|failed to fetch start\/end frame/i,
    th: "โหลดรูป Start/End Frame ไม่ได้ ไฟล์อาจหมดอายุหรือไม่มีสิทธิ์เข้าถึง ลองอัปโหลดหรือเลือกภาพใหม่แล้วรันอีกครั้งครับ",
    en: "The start/end frame could not be loaded. Re-upload or choose the image again, then run it once more.",
    ja: "開始/終了フレームを読み込めませんでした。画像を再アップロードするか選び直してから再実行してください。",
    es: "No se pudo cargar el frame de inicio/fin. Vuelve a subir o elegir la imagen y ejecuta de nuevo.",
    hi: "स्टार्ट/एंड फ़्रेम लोड नहीं हो सका। छवि फिर से अपलोड या चुनें और दोबारा रन करें।",
  },
  {
    match: /Provider queue was busy|provider.*busy|queue was busy|HTTP 503|503|temporar(?:y|ily).*unavailable|high demand|overload/i,
    th: "ตอนนี้ผู้ให้บริการ AI มีคิวเยอะหรือโหลดสูง ระบบจะลองให้อัตโนมัติจนกว่าจะครบเวลา หากไม่สำเร็จจะคืนเครดิตให้ครับ",
    en: "The AI provider is busy right now. We'll keep retrying until the time limit; if it still cannot finish, credits will be refunded.",
    ja: "AI プロバイダーが混み合っています。制限時間まで自動で再試行し、完了できない場合はクレジットを返金します。",
    es: "El proveedor de IA está ocupado ahora. Seguiremos reintentando hasta el límite; si no termina, se devolverán los créditos.",
    hi: "AI प्रदाता अभी व्यस्त है। हम समय सीमा तक पुनः प्रयास करते रहेंगे; यदि पूरा नहीं हुआ तो क्रेडिट वापस कर दिए जाएंगे।",
  },

  // ── Network / timeouts ─────────────────────────────────────
  {
    match: /Failed to fetch|NetworkError|fetch failed|abort/i,
    th: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
    en: "Couldn't reach the server — check your connection and try again.",
    ja: "サーバーに接続できません。インターネット接続を確認して再試行してください。",
    es: "No se pudo conectar con el servidor — comprueba tu conexión y reinténtalo.",
    hi: "सर्वर तक नहीं पहुँच सके — अपना कनेक्शन जाँचें और फिर से प्रयास करें।",
  },
  {
    match: /timeout|timed out|deadline/i,
    th: "การประมวลผลใช้เวลานานเกินไป ลองใหม่อีกครั้ง",
    en: "Request took too long — please try again.",
    ja: "処理に時間がかかりすぎました。もう一度お試しください。",
    es: "La petición tardó demasiado — vuelve a intentarlo.",
    hi: "अनुरोध में बहुत समय लगा — कृपया फिर से प्रयास करें।",
  },

  // ── Validation ─────────────────────────────────────────────
  {
    match: /Text node has @mentions that are not wired into its image-ref input|stale mention chips|not wired into its image-ref/i,
    th: "Text node มีรูปอ้างอิงเก่าที่ไม่ได้เชื่อมต่อแล้ว กรุณาลบ mention เก่าหรือเลือก mention จากรูปที่เชื่อมเข้า Text node อยู่ตอนนี้",
    en: "This Text node still contains an old image mention. Remove it or choose a reference that is currently connected to the Text node.",
    ja: "この Text node には接続されていない古い画像参照が残っています。削除するか、現在接続されている参照を選んでください。",
    es: "Este Text node todavía contiene una mención de imagen antigua. Elimínala o elige una referencia conectada al Text node ahora.",
    hi: "इस Text node में अभी भी पुराना इमेज मेंशन है। इसे हटाएँ या Text node से जुड़े वर्तमान संदर्भ को चुनें।",
  },
  {
    match: /Text node has @mentions whose image output is not ready yet|image output is not ready/i,
    th: "รูปอ้างอิงใน Text node ยังไม่พร้อม กรุณารอให้อัปโหลดหรือเจนรูปนั้นเสร็จก่อน",
    en: "One of the image references in the Text node is not ready yet. Wait for the upload or generation to finish first.",
    ja: "Text node の画像参照がまだ準備できていません。アップロードまたは生成が完了してから実行してください。",
    es: "Una de las referencias de imagen del Text node aún no está lista. Espera a que termine la carga o la generación.",
    hi: "Text node में एक इमेज संदर्भ अभी तैयार नहीं है। पहले अपलोड या जेनरेशन पूरा होने दें।",
  },
  {
    match: /Text-node @mentions|image refs from Text-node mentions|accepts max \d+ image ref|direct wires \+ Text-node @mentions/i,
    th: "จำนวนรูปอ้างอิงเกินกว่าที่โมเดลนี้รองรับ กรุณาลดรูปที่เชื่อมตรงหรือ mention ใน Text node ก่อนเจน",
    en: "This model cannot accept that many image references. Remove extra direct wires or Text-node mentions before generating.",
    ja: "このモデルが受け取れる画像参照数を超えています。直接接続または Text node の参照を減らしてください。",
    es: "Este modelo no acepta tantas referencias de imagen. Elimina conexiones directas extra o menciones del Text node antes de generar.",
    hi: "यह मॉडल इतने इमेज संदर्भ स्वीकार नहीं करता। जेनरेट करने से पहले अतिरिक्त वायर या Text-node मेंशन हटाएँ।",
  },
  {
    match: /still[\s_-]*uploading|asset[\s_-]*not[\s_-]*ready/i,
    th: "ไฟล์อ้างอิงยังอัปโหลดไม่เสร็จ รอสักครู่แล้วกด Run อีกครั้ง",
    en: "Reference file is still uploading — wait a moment and click Run again.",
    ja: "参照ファイルはまだアップロード中です。少し待ってから再度 Run してください。",
    es: "El archivo de referencia aún se está subiendo — espera un momento y vuelve a pulsar Run.",
    hi: "संदर्भ फ़ाइल अभी अपलोड हो रही है — कुछ देर रुकें और फिर से Run दबाएँ।",
  },
  {
    match: /Seedance 2\.0 reference videos?|reference video.*2-15|reference video duration|total.*reference.*15|content\[\d+\].*video duration/i,
    th: "วิดีโออ้างอิงของ Seedance 2.0 ต้องยาว 2-15 วินาที และรวมกันไม่เกิน 15 วินาที",
    en: "Seedance 2.0 reference videos must be 2-15 seconds, with total reference video duration up to 15 seconds.",
    ja: "Seedance 2.0 の参照動画は 2〜15 秒、合計 15 秒以内にしてください。",
    es: "Los vídeos de referencia de Seedance 2.0 deben durar entre 2 y 15 segundos, con una duración total de hasta 15 segundos.",
    hi: "Seedance 2.0 के संदर्भ वीडियो 2–15 सेकंड के होने चाहिए, कुल अवधि 15 सेकंड तक।",
  },
  {
    match: /Motion Control requires a video_url|requires a reference video — connect a video into the ref_video|Motion Control requires an image_url/i,
    th: "Kling Motion Pro ต้องมี Reference Video — เชื่อมโหนดวิดีโอเข้าพอร์ต ref_video (วิดีโอนี้กำหนดท่าทางและความยาว)",
    en: "Kling Motion Pro needs a reference video — connect a video node into the ref_video port (it dictates the motion and duration).",
    ja: "Kling Motion Pro はリファレンス動画が必要です。動画ノードを ref_video ポートに接続してください（動きと長さを決定します）。",
    es: "Kling Motion Pro necesita un vídeo de referencia — conecta un nodo de vídeo al puerto ref_video (define el movimiento y la duración).",
    hi: "Kling Motion Pro को संदर्भ वीडियो चाहिए — एक वीडियो नोड ref_video पोर्ट से जोड़ें (यह गति और अवधि तय करता है)।",
  },
  {
    match: /validation|invalid[\s_-]*param|400[\s_]/i,
    th: "ข้อมูลที่ส่งไม่ถูกต้อง — ตรวจสอบแล้วลองใหม่",
    en: "Some inputs are invalid — please double-check and try again.",
    ja: "入力内容に誤りがあります。確認して再試行してください。",
    es: "Algunos datos no son válidos — revisa y vuelve a intentarlo.",
    hi: "कुछ इनपुट अमान्य हैं — कृपया जाँचें और फिर से प्रयास करें।",
  },

  // ── Workspace media-tool errors (videoAudioActions, StandaloneGenerator) ─
  {
    match: /Audio extraction is not supported|Muted video export is not supported|Canvas rendering is not available/i,
    th: "เบราว์เซอร์นี้ไม่รองรับการตัดต่อเสียง/วิดีโอ ลองเปิดด้วย Chrome หรือ Edge เวอร์ชันล่าสุด",
    en: "Your browser doesn't support this video/audio operation. Try the latest Chrome or Edge.",
    ja: "このブラウザはこの音声/動画操作をサポートしていません。最新の Chrome または Edge をお試しください。",
    es: "Tu navegador no admite esta operación de vídeo/audio. Prueba con la versión más reciente de Chrome o Edge.",
    hi: "आपका ब्राउज़र इस वीडियो/ऑडियो ऑपरेशन का समर्थन नहीं करता। नवीनतम Chrome या Edge आज़माएँ।",
  },
  {
    match: /does not contain an audio track/i,
    th: "วิดีโอนี้ไม่มีแทร็กเสียง",
    en: "This video has no audio track.",
    ja: "このビデオには音声トラックがありません。",
    es: "Este vídeo no tiene pista de audio.",
    hi: "इस वीडियो में कोई ऑडियो ट्रैक नहीं है।",
  },
  {
    match: /Muted video export produced no data/i,
    th: "การ export วิดีโอแบบไม่มีเสียงไม่ได้ข้อมูล ลองอีกครั้ง",
    en: "Muted video export produced no data. Please try again.",
    ja: "ミュート動画の書き出しでデータが生成されませんでした。もう一度お試しください。",
    es: "La exportación de vídeo silenciado no generó datos. Vuelve a intentarlo.",
    hi: "म्यूट वीडियो एक्सपोर्ट से कोई डेटा नहीं मिला। कृपया फिर से प्रयास करें।",
  },
  {
    match: /Please sign in before uploading|^Not signed in/i,
    th: "กรุณาเข้าสู่ระบบก่อน",
    en: "Please sign in first.",
    ja: "先にサインインしてください。",
    es: "Inicia sesión primero.",
    hi: "कृपया पहले साइन इन करें।",
  },
  {
    match: /Create or select a project before uploading/i,
    th: "สร้างหรือเลือกโปรเจกต์ก่อนอัปโหลดไฟล์อ้างอิง",
    en: "Create or select a project before uploading references.",
    ja: "参照をアップロードする前にプロジェクトを作成または選択してください。",
    es: "Crea o selecciona un proyecto antes de subir referencias.",
    hi: "संदर्भ अपलोड करने से पहले एक प्रोजेक्ट बनाएँ या चुनें।",
  },
  {
    match: /Only image[, ]+video[, ]+or audio references are supported|Only image or video references are supported/i,
    th: "รองรับเฉพาะไฟล์อ้างอิงประเภทรูปภาพ วิดีโอ หรือเสียงเท่านั้น",
    en: "Only image, video, or audio references are supported here.",
    ja: "画像、ビデオ、または音声の参照のみサポートされています。",
    es: "Solo se admiten referencias de imagen, vídeo o audio aquí.",
    hi: "यहाँ केवल इमेज, वीडियो या ऑडियो संदर्भ ही समर्थित हैं।",
  },

  // ── Video frame extraction / browser media errors ───────────
  {
    match: /Could not load video(?:\.| for frame extraction)|Could not prepare video frame canvas|Could not capture video frame|Could not sign extracted video frame/i,
    th: "เบราว์เซอร์อ่านเฟรมจากวิดีโอไม่ได้ ลองรีโหลดหรือเปิดด้วย Chrome/Edge เวอร์ชันล่าสุด",
    en: "Your browser couldn't read a frame from this video. Reload, or open in the latest Chrome/Edge.",
    ja: "ブラウザがこの動画からフレームを読み取れませんでした。再読み込みするか、最新の Chrome/Edge で開いてください。",
    es: "Tu navegador no pudo leer un frame de este vídeo. Recarga o ábrelo en la versión más reciente de Chrome/Edge.",
    hi: "आपका ब्राउज़र इस वीडियो से फ़्रेम नहीं पढ़ सका। पुनः लोड करें या नवीनतम Chrome/Edge में खोलें।",
  },

  // ── Billing portal / org-admin / teacher-center ─────────────
  {
    match: /No portal URL returned|portal[\s_-]*url[\s_-]*not/i,
    th: "เปิด portal ไม่ได้ ลองใหม่หรือติดต่อทีมงาน",
    en: "Could not open the billing portal. Please try again or contact support.",
    ja: "請求ポータルを開けませんでした。もう一度お試しいただくか、サポートにお問い合わせください。",
    es: "No se pudo abrir el portal de facturación. Vuelve a intentarlo o contacta a soporte.",
    hi: "बिलिंग पोर्टल नहीं खुल सका। कृपया फिर से प्रयास करें या सपोर्ट से संपर्क करें।",
  },
  {
    match: /Amount must be a positive integer|amount_must_be_positive/i,
    th: "จำนวนต้องเป็นเลขจำนวนเต็มบวก",
    en: "Amount must be a positive whole number.",
    ja: "数量は正の整数でなければなりません。",
    es: "La cantidad debe ser un número entero positivo.",
    hi: "मात्रा एक धनात्मक पूर्णांक होनी चाहिए।",
  },
  {
    match: /No class space to revoke|student_space_not_found/i,
    th: "ยังไม่มี space ของนักเรียนให้ดำเนินการ",
    en: "No student space found to act on yet.",
    ja: "対象となる生徒のスペースが見つかりません。",
    es: "Aún no hay espacio de estudiante para actuar.",
    hi: "अभी कोई छात्र स्पेस उपलब्ध नहीं है।",
  },
  {
    match: /class_budget_exhausted/i,
    th: "เครดิตของคลาสไม่พอ",
    en: "Class credit pool is not enough.",
    ja: "クラスのクレジットプールが不足しています。",
    es: "Los créditos de la clase no son suficientes.",
    hi: "क्लास के क्रेडिट पर्याप्त नहीं हैं।",
  },
  {
    match: /No promo package available/i,
    th: "ตอนนี้ยังไม่มีแพ็กโปรโมชันให้เลือก ลองใหม่ภายหลังครับ",
    en: "No promotional package is available right now. Please try again later.",
    ja: "現在ご利用いただけるプロモーションパッケージはありません。後ほど再度お試しください。",
    es: "No hay paquetes promocionales disponibles ahora. Vuelve a intentarlo más tarde.",
    hi: "अभी कोई प्रमोशनल पैकेज उपलब्ध नहीं है। कृपया बाद में पुनः प्रयास करें।",
  },
];

/** Generic fallback when no pattern matches. */
const GENERIC: Record<Lang, string> = {
  th: "เกิดข้อผิดพลาด ลองอีกครั้งหรือติดต่อทีมงาน",
  en: "Something went wrong — try again or contact support.",
  ja: "問題が発生しました。もう一度試すか、サポートにお問い合わせください。",
  es: "Algo salió mal — vuelve a intentarlo o contacta a soporte.",
  hi: "कुछ गलत हुआ — फिर से प्रयास करें या सपोर्ट से संपर्क करें।",
};

/**
 * Map any error-shaped value to a localized, customer-safe string.
 * Always logs the raw error to console.error so the team can debug.
 *
 * @param err - The error (Error instance, string, or unknown thrown value).
 * @param lang - "th" | "en". Defaults to "en".
 * @returns A short user-facing message.
 */
export function friendlyError(err: unknown, lang: Lang = "en"): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();

  // Always preserve the raw text in console for debugging — the
  // customer-facing layer never sees this but the team does.
  console.error("[friendlyError] raw:", raw);

  for (const m of MAPPINGS) {
    if (m.match.test(raw)) {
      return m[lang] ?? m.en;
    }
  }
  return GENERIC[lang];
}

/** Sugar — when the toast site already has a `t()` from
 *  useLanguage but you still want the raw-error fallback. */
export function friendlyErrorOr(err: unknown, lang: Lang, fallback: string): string {
  const friendly = friendlyError(err, lang);
  return friendly === GENERIC[lang] ? fallback : friendly;
}

export async function functionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error || "Request failed");
  const response = (error as { context?: Response } | null)?.context;
  if (!response || typeof response.clone !== "function") return fallback;
  try {
    const text = await response.clone().text();
    if (!text) return fallback;
    try {
      const body = JSON.parse(text) as { error?: unknown; message?: unknown };
      return String(body?.error || body?.message || text || fallback);
    } catch {
      return text;
    }
  } catch {
    return fallback;
  }
}
