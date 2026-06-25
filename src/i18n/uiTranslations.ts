type AppLanguageCode = "en" | "hi" | "bn" | "fr" | "es" | "de" | "ar" | "ja" | "zh" | "pt";

type TranslationRecord = Partial<Record<AppLanguageCode, string>>;

type TranslatableAttribute = "placeholder" | "aria-label" | "title";

const exactTranslations: Record<string, TranslationRecord> = {
  "Dashboard": { hi: "डैशबोर्ड", bn: "ড্যাশবোর্ড", fr: "Tableau de bord", es: "Panel", de: "Dashboard", ar: "لوحة التحكم", ja: "ダッシュボード", zh: "仪表板", pt: "Painel" },
  "Shared Split Rooms": { hi: "साझा स्प्लिट रूम", bn: "শেয়ারড স্প্লিট রুম", fr: "Salles de partage", es: "Salas compartidas", de: "Geteilte Split-Räume", ar: "غرف التقسيم المشتركة", ja: "共有スプリットルーム", zh: "共享分账房间", pt: "Salas de divisão" },
  "Friends": { hi: "दोस्त", bn: "বন্ধুরা", fr: "Amis", es: "Amigos", de: "Freunde", ar: "الأصدقاء", ja: "友達", zh: "好友", pt: "Amigos" },
  "Wallet & Balance": { hi: "वॉलेट और बैलेंस", bn: "ওয়ালেট ও ব্যালেন্স", fr: "Portefeuille et solde", es: "Cartera y saldo", de: "Wallet & Guthaben", ar: "المحفظة والرصيد", ja: "ウォレットと残高", zh: "钱包与余额", pt: "Carteira e saldo" },
  "Wallet Top-Up": { hi: "वॉलेट टॉप-अप", bn: "ওয়ালেট টপ-আপ", fr: "Recharger le portefeuille", es: "Recargar cartera", de: "Wallet aufladen", ar: "شحن المحفظة", ja: "ウォレット入金", zh: "钱包充值", pt: "Recarregar carteira" },
  "Transaction History": { hi: "लेनदेन इतिहास", bn: "লেনদেন ইতিহাস", fr: "Historique des transactions", es: "Historial de transacciones", de: "Transaktionsverlauf", ar: "سجل المعاملات", ja: "取引履歴", zh: "交易历史", pt: "Histórico de transações" },
  "App settings": { hi: "ऐप सेटिंग्स", bn: "অ্যাপ সেটিংস", fr: "Paramètres de l'application", es: "Ajustes de la app", de: "App-Einstellungen", ar: "إعدادات التطبيق", ja: "アプリ設定", zh: "应用设置", pt: "Configurações do app" },
  "Application currency": { hi: "एप्लिकेशन मुद्रा", bn: "অ্যাপ্লিকেশন মুদ্রা", fr: "Devise de l'application", es: "Moneda de la aplicación", de: "App-Währung", ar: "عملة التطبيق", ja: "アプリの通貨", zh: "应用货币", pt: "Moeda do aplicativo" },
  "Application language": { hi: "एप्लिकेशन भाषा", bn: "অ্যাপ্লিকেশন ভাষা", fr: "Langue de l'application", es: "Idioma de la aplicación", de: "App-Sprache", ar: "لغة التطبيق", ja: "アプリの言語", zh: "应用语言", pt: "Idioma do aplicativo" },
  "Money display": { hi: "पैसे का प्रदर्शन", bn: "টাকার প্রদর্শন", fr: "Affichage de l'argent", es: "Visualización del dinero", de: "Geldanzeige", ar: "عرض المال", ja: "金額表示", zh: "金额显示", pt: "Exibição de dinheiro" },
  "Use this currency across the app": { hi: "पूरे ऐप में इस मुद्रा का उपयोग करें", bn: "পুরো অ্যাপে এই মুদ্রা ব্যবহার করুন", fr: "Utiliser cette devise dans toute l'application", es: "Usar esta moneda en toda la app", de: "Diese Währung in der ganzen App verwenden", ar: "استخدم هذه العملة في التطبيق كله", ja: "アプリ全体でこの通貨を使う", zh: "在整个应用中使用此货币", pt: "Usar esta moeda em todo o app" },
  "Example display": { hi: "उदाहरण प्रदर्शन", bn: "উদাহরণ প্রদর্শন", fr: "Exemple d'affichage", es: "Ejemplo de visualización", de: "Beispielanzeige", ar: "مثال العرض", ja: "表示例", zh: "显示示例", pt: "Exemplo de exibição" },
  "Log in": { hi: "लॉग इन", bn: "লগ ইন", fr: "Connexion", es: "Iniciar sesión", de: "Anmelden", ar: "تسجيل الدخول", ja: "ログイン", zh: "登录", pt: "Entrar" },
  "Sign up": { hi: "साइन अप", bn: "সাইন আপ", fr: "S'inscrire", es: "Registrarse", de: "Registrieren", ar: "إنشاء حساب", ja: "登録", zh: "注册", pt: "Cadastrar" },
  "Create account": { hi: "खाता बनाएं", bn: "অ্যাকাউন্ট তৈরি করুন", fr: "Créer un compte", es: "Crear cuenta", de: "Konto erstellen", ar: "إنشاء حساب", ja: "アカウント作成", zh: "创建账户", pt: "Criar conta" },
  "Continue with Google": { hi: "Google से जारी रखें", bn: "Google দিয়ে চালিয়ে যান", fr: "Continuer avec Google", es: "Continuar con Google", de: "Mit Google fortfahren", ar: "المتابعة باستخدام Google", ja: "Googleで続行", zh: "使用 Google 继续", pt: "Continuar com Google" },
  "or continue with": { hi: "या जारी रखें", bn: "অথবা চালিয়ে যান", fr: "ou continuer avec", es: "o continuar con", de: "oder fortfahren mit", ar: "أو تابع باستخدام", ja: "または次で続行", zh: "或继续使用", pt: "ou continuar com" },
  "or sign up with": { hi: "या साइन अप करें", bn: "অথবা সাইন আপ করুন", fr: "ou s'inscrire avec", es: "o registrarse con", de: "oder registrieren mit", ar: "أو سجّل باستخدام", ja: "または次で登録", zh: "或使用以下方式注册", pt: "ou cadastrar com" },
  "Email address": { hi: "ईमेल पता", bn: "ইমেল ঠিকানা", fr: "Adresse e-mail", es: "Correo electrónico", de: "E-Mail-Adresse", ar: "البريد الإلكتروني", ja: "メールアドレス", zh: "电子邮件地址", pt: "E-mail" },
  "Password": { hi: "पासवर्ड", bn: "পাসওয়ার্ড", fr: "Mot de passe", es: "Contraseña", de: "Passwort", ar: "كلمة المرور", ja: "パスワード", zh: "密码", pt: "Senha" },
  "Full name": { hi: "पूरा नाम", bn: "পূর্ণ নাম", fr: "Nom complet", es: "Nombre completo", de: "Vollständiger Name", ar: "الاسم الكامل", ja: "氏名", zh: "全名", pt: "Nome completo" },
  "Your name": { hi: "आपका नाम", bn: "আপনার নাম", fr: "Votre nom", es: "Tu nombre", de: "Ihr Name", ar: "اسمك", ja: "あなたの名前", zh: "你的名字", pt: "Seu nome" },
  "Send login code": { hi: "लॉगिन कोड भेजें", bn: "লগইন কোড পাঠান", fr: "Envoyer le code", es: "Enviar código", de: "Anmeldecode senden", ar: "إرسال رمز الدخول", ja: "ログインコードを送信", zh: "发送登录码", pt: "Enviar código de login" },
  "Verify and log in": { hi: "सत्यापित करें और लॉग इन करें", bn: "যাচাই করে লগ ইন করুন", fr: "Vérifier et se connecter", es: "Verificar e iniciar sesión", de: "Prüfen und anmelden", ar: "تحقق وسجّل الدخول", ja: "確認してログイン", zh: "验证并登录", pt: "Verificar e entrar" },
  "Forgot password?": { hi: "पासवर्ड भूल गए?", bn: "পাসওয়ার্ড ভুলে গেছেন?", fr: "Mot de passe oublié ?", es: "¿Olvidaste la contraseña?", de: "Passwort vergessen?", ar: "هل نسيت كلمة المرور؟", ja: "パスワードを忘れた？", zh: "忘记密码？", pt: "Esqueceu a senha?" },
  "Reset your password.": { hi: "अपना पासवर्ड रीसेट करें।", bn: "আপনার পাসওয়ার্ড রিসেট করুন।", fr: "Réinitialisez votre mot de passe.", es: "Restablece tu contraseña.", de: "Setzen Sie Ihr Passwort zurück.", ar: "أعد تعيين كلمة المرور.", ja: "パスワードをリセットします。", zh: "重置你的密码。", pt: "Redefina sua senha." },
  "Send reset link": { hi: "रीसेट लिंक भेजें", bn: "রিসেট লিঙ্ক পাঠান", fr: "Envoyer le lien", es: "Enviar enlace", de: "Link senden", ar: "إرسال رابط إعادة التعيين", ja: "リセットリンクを送信", zh: "发送重置链接", pt: "Enviar link" },
  "Logout": { hi: "लॉगआउट", bn: "লগআউট", fr: "Déconnexion", es: "Cerrar sesión", de: "Abmelden", ar: "تسجيل الخروج", ja: "ログアウト", zh: "退出登录", pt: "Sair" },
  "Add expense": { hi: "खर्च जोड़ें", bn: "খরচ যোগ করুন", fr: "Ajouter une dépense", es: "Añadir gasto", de: "Ausgabe hinzufügen", ar: "إضافة مصروف", ja: "支出を追加", zh: "添加支出", pt: "Adicionar despesa" },
  "Save Expense": { hi: "खर्च सेव करें", bn: "খরচ সেভ করুন", fr: "Enregistrer la dépense", es: "Guardar gasto", de: "Ausgabe speichern", ar: "حفظ المصروف", ja: "支出を保存", zh: "保存支出", pt: "Salvar despesa" },
  "Wallet Balance": { hi: "वॉलेट बैलेंस", bn: "ওয়ালেট ব্যালেন্স", fr: "Solde du portefeuille", es: "Saldo de cartera", de: "Wallet-Guthaben", ar: "رصيد المحفظة", ja: "ウォレット残高", zh: "钱包余额", pt: "Saldo da carteira" },
  "Available balance": { hi: "उपलब्ध बैलेंस", bn: "উপলব্ধ ব্যালেন্স", fr: "Solde disponible", es: "Saldo disponible", de: "Verfügbares Guthaben", ar: "الرصيد المتاح", ja: "利用可能残高", zh: "可用余额", pt: "Saldo disponível" },
  "Pending incoming": { hi: "आने वाला लंबित", bn: "আসন্ন বকেয়া", fr: "Entrées en attente", es: "Entradas pendientes", de: "Ausstehende Eingänge", ar: "الوارد المعلّق", ja: "保留中の入金", zh: "待收款", pt: "Entradas pendentes" },
  "Pending outgoing": { hi: "जाने वाला लंबित", bn: "যাওয়া বকেয়া", fr: "Sorties en attente", es: "Salidas pendientes", de: "Ausstehende Ausgänge", ar: "الصادر المعلّق", ja: "保留中の支払い", zh: "待付款", pt: "Saídas pendentes" },
  "Net position": { hi: "नेट स्थिति", bn: "নেট অবস্থান", fr: "Position nette", es: "Posición neta", de: "Nettoposition", ar: "الصافي", ja: "純ポジション", zh: "净额", pt: "Posição líquida" },
  "Wallet Activity": { hi: "वॉलेट गतिविधि", bn: "ওয়ালেট কার্যকলাপ", fr: "Activité du portefeuille", es: "Actividad de cartera", de: "Wallet-Aktivität", ar: "نشاط المحفظة", ja: "ウォレット活動", zh: "钱包活动", pt: "Atividade da carteira" },
  "Recent transactions": { hi: "हाल के लेनदेन", bn: "সাম্প্রতিক লেনদেন", fr: "Transactions récentes", es: "Transacciones recientes", de: "Aktuelle Transaktionen", ar: "المعاملات الأخيرة", ja: "最近の取引", zh: "最近交易", pt: "Transações recentes" },
  "Ledger": { hi: "लेजर", bn: "লেজার", fr: "Grand livre", es: "Libro mayor", de: "Buch", ar: "السجل", ja: "台帳", zh: "账本", pt: "Livro-razão" },
  "Pending settlements": { hi: "लंबित सेटलमेंट", bn: "বকেয়া সেটেলমেন্ট", fr: "Règlements en attente", es: "Liquidaciones pendientes", de: "Ausstehende Abrechnungen", ar: "التسويات المعلّقة", ja: "保留中の精算", zh: "待结算", pt: "Acertos pendentes" },
  "Top up your wallet": { hi: "अपना वॉलेट टॉप अप करें", bn: "আপনার ওয়ালেট টপ-আপ করুন", fr: "Rechargez votre portefeuille", es: "Recarga tu cartera", de: "Wallet aufladen", ar: "اشحن محفظتك", ja: "ウォレットを入金", zh: "充值钱包", pt: "Recarregue sua carteira" },
  "Choose amount": { hi: "राशि चुनें", bn: "পরিমাণ নির্বাচন করুন", fr: "Choisir le montant", es: "Elegir importe", de: "Betrag wählen", ar: "اختر المبلغ", ja: "金額を選択", zh: "选择金额", pt: "Escolher valor" },
  "Payment method": { hi: "भुगतान विधि", bn: "পেমেন্ট পদ্ধতি", fr: "Méthode de paiement", es: "Método de pago", de: "Zahlungsmethode", ar: "طريقة الدفع", ja: "支払い方法", zh: "支付方式", pt: "Método de pagamento" },
  "Add money": { hi: "पैसे जोड़ें", bn: "টাকা যোগ করুন", fr: "Ajouter de l'argent", es: "Añadir dinero", de: "Geld hinzufügen", ar: "إضافة مال", ja: "お金を追加", zh: "添加资金", pt: "Adicionar dinheiro" },
  "Search transactions": { hi: "लेनदेन खोजें", bn: "লেনদেন খুঁজুন", fr: "Rechercher des transactions", es: "Buscar transacciones", de: "Transaktionen suchen", ar: "بحث المعاملات", ja: "取引を検索", zh: "搜索交易", pt: "Pesquisar transações" },
  "All activity": { hi: "सारी गतिविधि", bn: "সব কার্যকলাপ", fr: "Toute l'activité", es: "Toda la actividad", de: "Alle Aktivitäten", ar: "كل النشاط", ja: "すべての活動", zh: "所有活动", pt: "Toda atividade" },
  "Download CSV": { hi: "CSV डाउनलोड करें", bn: "CSV ডাউনলোড করুন", fr: "Télécharger CSV", es: "Descargar CSV", de: "CSV herunterladen", ar: "تنزيل CSV", ja: "CSVをダウンロード", zh: "下载 CSV", pt: "Baixar CSV" },
  "Create room": { hi: "रूम बनाएं", bn: "রুম তৈরি করুন", fr: "Créer une salle", es: "Crear sala", de: "Raum erstellen", ar: "إنشاء غرفة", ja: "ルーム作成", zh: "创建房间", pt: "Criar sala" },
  "Room name": { hi: "रूम का नाम", bn: "রুমের নাম", fr: "Nom de la salle", es: "Nombre de sala", de: "Raumname", ar: "اسم الغرفة", ja: "ルーム名", zh: "房间名称", pt: "Nome da sala" },
  "Room category": { hi: "रूम श्रेणी", bn: "রুম বিভাগ", fr: "Catégorie de salle", es: "Categoría de sala", de: "Raumkategorie", ar: "فئة الغرفة", ja: "ルームカテゴリ", zh: "房间类别", pt: "Categoria da sala" },
  "Choose friends": { hi: "दोस्त चुनें", bn: "বন্ধু নির্বাচন করুন", fr: "Choisir des amis", es: "Elegir amigos", de: "Freunde wählen", ar: "اختر الأصدقاء", ja: "友達を選択", zh: "选择好友", pt: "Escolher amigos" },
  "Add item": { hi: "आइटम जोड़ें", bn: "আইটেম যোগ করুন", fr: "Ajouter un élément", es: "Añadir ítem", de: "Eintrag hinzufügen", ar: "إضافة عنصر", ja: "項目を追加", zh: "添加项目", pt: "Adicionar item" },
  "Item name": { hi: "आइटम नाम", bn: "আইটেমের নাম", fr: "Nom de l'élément", es: "Nombre del ítem", de: "Eintragsname", ar: "اسم العنصر", ja: "項目名", zh: "项目名称", pt: "Nome do item" },
  "Assign to": { hi: "किसे असाइन करें", bn: "অ্যাসাইন করুন", fr: "Attribuer à", es: "Asignar a", de: "Zuweisen an", ar: "تعيين إلى", ja: "割り当て先", zh: "分配给", pt: "Atribuir a" },
  "Split history": { hi: "स्प्लिट इतिहास", bn: "স্প্লিট ইতিহাস", fr: "Historique de partage", es: "Historial de división", de: "Split-Verlauf", ar: "سجل التقسيم", ja: "分割履歴", zh: "分账历史", pt: "Histórico de divisão" },
  "Manage room members": { hi: "रूम सदस्यों को मैनेज करें", bn: "রুম সদস্য পরিচালনা", fr: "Gérer les membres", es: "Gestionar miembros", de: "Mitglieder verwalten", ar: "إدارة أعضاء الغرفة", ja: "メンバー管理", zh: "管理成员", pt: "Gerenciar membros" },
  "Friend email": { hi: "दोस्त का ईमेल", bn: "বন্ধুর ইমেল", fr: "E-mail de l'ami", es: "Correo del amigo", de: "E-Mail des Freundes", ar: "بريد الصديق", ja: "友達のメール", zh: "好友邮箱", pt: "E-mail do amigo" },
  "Send request": { hi: "रिक्वेस्ट भेजें", bn: "অনুরোধ পাঠান", fr: "Envoyer la demande", es: "Enviar solicitud", de: "Anfrage senden", ar: "إرسال طلب", ja: "リクエスト送信", zh: "发送请求", pt: "Enviar pedido" },
  "Your friends": { hi: "आपके दोस्त", bn: "আপনার বন্ধুরা", fr: "Vos amis", es: "Tus amigos", de: "Ihre Freunde", ar: "أصدقاؤك", ja: "あなたの友達", zh: "你的好友", pt: "Seus amigos" },
  "Friend inbox": { hi: "दोस्त इनबॉक्स", bn: "বন্ধু ইনবক্স", fr: "Boîte de réception", es: "Bandeja de amigos", de: "Freundesanfragen", ar: "صندوق الأصدقاء", ja: "友達受信箱", zh: "好友收件箱", pt: "Caixa de amigos" },
  "Sent requests": { hi: "भेजी गई रिक्वेस्ट", bn: "পাঠানো অনুরোধ", fr: "Demandes envoyées", es: "Solicitudes enviadas", de: "Gesendete Anfragen", ar: "الطلبات المرسلة", ja: "送信済みリクエスト", zh: "已发送请求", pt: "Pedidos enviados" },
  "Profile privacy": { hi: "प्रोफ़ाइल गोपनीयता", bn: "প্রোফাইল গোপনীয়তা", fr: "Confidentialité du profil", es: "Privacidad del perfil", de: "Profil-Datenschutz", ar: "خصوصية الملف الشخصي", ja: "プロフィールのプライバシー", zh: "资料隐私", pt: "Privacidade do perfil" },
  "Photo display": { hi: "फोटो प्रदर्शन", bn: "ছবি প্রদর্শন", fr: "Affichage photo", es: "Mostrar foto", de: "Fotoanzeige", ar: "عرض الصورة", ja: "写真表示", zh: "照片显示", pt: "Exibição da foto" },
  "Use initials instead of photo": { hi: "फोटो की जगह initials दिखाएं", bn: "ছবির বদলে initials দেখান", fr: "Utiliser les initiales au lieu de la photo", es: "Usar iniciales en lugar de foto", de: "Initialen statt Foto verwenden", ar: "استخدم الأحرف الأولى بدلاً من الصورة", ja: "写真の代わりにイニシャルを使用", zh: "使用姓名首字母代替照片", pt: "Usar iniciais em vez de foto" },
  "Profile photo URL": { hi: "प्रोफ़ाइल फोटो URL", bn: "প্রোফাইল ছবির URL", fr: "URL de photo de profil", es: "URL de foto de perfil", de: "Profilfoto-URL", ar: "رابط صورة الملف الشخصي", ja: "プロフィール写真URL", zh: "头像图片 URL", pt: "URL da foto do perfil" },
  "Save profile photo": { hi: "प्रोफ़ाइल फोटो सेव करें", bn: "প্রোফাইল ছবি সেভ করুন", fr: "Enregistrer la photo", es: "Guardar foto", de: "Profilfoto speichern", ar: "حفظ صورة الملف", ja: "プロフィール写真を保存", zh: "保存头像", pt: "Salvar foto" },
  "Danger zone": { hi: "जोखिम क्षेत्र", bn: "ঝুঁকি এলাকা", fr: "Zone dangereuse", es: "Zona de peligro", de: "Gefahrenbereich", ar: "منطقة الخطر", ja: "危険ゾーン", zh: "危险区域", pt: "Zona de perigo" },
  "Delete account": { hi: "खाता हटाएं", bn: "অ্যাকাউন্ট মুছুন", fr: "Supprimer le compte", es: "Eliminar cuenta", de: "Konto löschen", ar: "حذف الحساب", ja: "アカウント削除", zh: "删除账户", pt: "Excluir conta" },
  "Download my data": { hi: "मेरा डेटा डाउनलोड करें", bn: "আমার ডেটা ডাউনলোড করুন", fr: "Télécharger mes données", es: "Descargar mis datos", de: "Meine Daten herunterladen", ar: "تنزيل بياناتي", ja: "自分のデータをダウンロード", zh: "下载我的数据", pt: "Baixar meus dados" },
  "Start splitting smarter.": { hi: "बेहतर तरीके से स्प्लिट करना शुरू करें।", bn: "আরও স্মার্টভাবে ভাগ করা শুরু করুন।", fr: "Commencez à partager plus intelligemment.", es: "Empieza a dividir de forma más inteligente.", de: "Beginnen Sie smarter zu teilen.", ar: "ابدأ التقسيم بذكاء أكبر.", ja: "よりスマートに分割を始めましょう。", zh: "开始更智能地分账。", pt: "Comece a dividir melhor." },
  "Split group bills with institutional calm.": { hi: "ग्रुप बिल को शांत और साफ तरीके से स्प्लिट करें।", bn: "গ্রুপ বিল শান্তভাবে ভাগ করুন।", fr: "Partagez les factures de groupe avec calme.", es: "Divide cuentas de grupo con calma.", de: "Teilen Sie Gruppenrechnungen ruhig auf.", ar: "قسّم فواتير المجموعة بهدوء.", ja: "グループ請求を落ち着いて分割。", zh: "从容地分摊群组账单。", pt: "Divida contas de grupo com calma." },
  "Item-wise receipt flow": { hi: "आइटम-वार रसीद फ्लो", bn: "আইটেমভিত্তিক রসিদ ফ্লো", fr: "Flux de reçu par article", es: "Flujo por ítem", de: "Artikelweiser Belegfluss", ar: "تدفق إيصال حسب العنصر", ja: "項目別レシートフロー", zh: "按项目收据流程", pt: "Fluxo por item" },
  "Friends and groups": { hi: "दोस्त और ग्रुप", bn: "বন্ধু ও গ্রুপ", fr: "Amis et groupes", es: "Amigos y grupos", de: "Freunde und Gruppen", ar: "الأصدقاء والمجموعات", ja: "友達とグループ", zh: "好友和群组", pt: "Amigos e grupos" },
  "Simple balance math": { hi: "सरल बैलेंस गणित", bn: "সহজ ব্যালেন্স হিসাব", fr: "Calcul simple des soldes", es: "Cálculo simple de saldo", de: "Einfache Saldenrechnung", ar: "حساب رصيد بسيط", ja: "簡単な残高計算", zh: "简单余额计算", pt: "Cálculo simples de saldo" },
  "Gentle reminders": { hi: "हल्के रिमाइंडर", bn: "নরম রিমাইন্ডার", fr: "Rappels doux", es: "Recordatorios suaves", de: "Sanfte Erinnerungen", ar: "تذكيرات لطيفة", ja: "やさしいリマインダー", zh: "温和提醒", pt: "Lembretes gentis" },
  "Settlement history": { hi: "सेटलमेंट इतिहास", bn: "সেটেলমেন্ট ইতিহাস", fr: "Historique des règlements", es: "Historial de pagos", de: "Abrechnungsverlauf", ar: "سجل التسويات", ja: "精算履歴", zh: "结算历史", pt: "Histórico de acertos" },
  "Trust-first interface": { hi: "विश्वास-प्रथम इंटरफ़ेस", bn: "বিশ্বাস-প্রথম ইন্টারফেস", fr: "Interface axée confiance", es: "Interfaz de confianza", de: "Vertrauensfreundliche Oberfläche", ar: "واجهة تركز على الثقة", ja: "信頼重視の画面", zh: "信任优先界面", pt: "Interface baseada em confiança" },
  "Product": { hi: "प्रोडक्ट", bn: "পণ্য", fr: "Produit", es: "Producto", de: "Produkt", ar: "المنتج", ja: "製品", zh: "产品", pt: "Produto" },
  "Use cases": { hi: "उपयोग के मामले", bn: "ব্যবহারের ক্ষেত্র", fr: "Cas d'utilisation", es: "Casos de uso", de: "Anwendungsfälle", ar: "حالات الاستخدام", ja: "利用シーン", zh: "使用场景", pt: "Casos de uso" },
  "Company": { hi: "कंपनी", bn: "কোম্পানি", fr: "Entreprise", es: "Empresa", de: "Unternehmen", ar: "الشركة", ja: "会社", zh: "公司", pt: "Empresa" },
  "Help": { hi: "मदद", bn: "সাহায্য", fr: "Aide", es: "Ayuda", de: "Hilfe", ar: "المساعدة", ja: "ヘルプ", zh: "帮助", pt: "Ajuda" },
};

const wordTranslations: Record<AppLanguageCode, Record<string, string>> = {
  en: {},
  hi: { Wallet: "वॉलेट", Balance: "बैलेंस", Room: "रूम", Rooms: "रूम", Friend: "दोस्त", Friends: "दोस्त", Settings: "सेटिंग्स", Profile: "प्रोफ़ाइल", Photo: "फोटो", Display: "प्रदर्शन", Language: "भाषा", Currency: "मुद्रा", Money: "पैसा", Amount: "राशि", Total: "कुल", Pending: "लंबित", Recent: "हाल", Transactions: "लेनदेन", History: "इतिहास", Add: "जोड़ें", Save: "सेव", Delete: "हटाएं", Search: "खोजें", Export: "निर्यात", Download: "डाउनलोड", Send: "भेजें", Create: "बनाएं", Login: "लॉगिन", Logout: "लॉगआउट", Password: "पासवर्ड", Email: "ईमेल", Account: "खाता", Members: "सदस्य", Items: "आइटम", Expense: "खर्च", Expenses: "खर्च", Settlement: "सेटलमेंट", Settlements: "सेटलमेंट", Notifications: "सूचनाएं", Reminder: "रिमाइंडर", Reminders: "रिमाइंडर", Privacy: "गोपनीयता", Default: "डिफ़ॉल्ट", Application: "एप्लिकेशन", Current: "वर्तमान", Loading: "लोड हो रहा है", Error: "त्रुटि", Paid: "भुगतान", Received: "प्राप्त", Owe: "देना", Owed: "मिलना" },
  bn: { Wallet: "ওয়ালেট", Balance: "ব্যালেন্স", Room: "রুম", Rooms: "রুম", Friend: "বন্ধু", Friends: "বন্ধু", Settings: "সেটিংস", Profile: "প্রোফাইল", Photo: "ছবি", Display: "প্রদর্শন", Language: "ভাষা", Currency: "মুদ্রা", Money: "টাকা", Amount: "পরিমাণ", Total: "মোট", Pending: "বকেয়া", Recent: "সাম্প্রতিক", Transactions: "লেনদেন", History: "ইতিহাস", Add: "যোগ", Save: "সেভ", Delete: "মুছুন", Search: "খুঁজুন", Export: "রপ্তানি", Download: "ডাউনলোড", Send: "পাঠান", Create: "তৈরি", Login: "লগইন", Logout: "লগআউট", Password: "পাসওয়ার্ড", Email: "ইমেল", Account: "অ্যাকাউন্ট", Members: "সদস্য", Items: "আইটেম", Expense: "খরচ", Expenses: "খরচ", Settlement: "সেটেলমেন্ট", Settlements: "সেটেলমেন্ট", Notifications: "নোটিফিকেশন", Reminder: "রিমাইন্ডার", Reminders: "রিমাইন্ডার", Privacy: "গোপনীয়তা", Default: "ডিফল্ট", Application: "অ্যাপ্লিকেশন", Current: "বর্তমান", Loading: "লোড হচ্ছে", Error: "ত্রুটি", Paid: "পরিশোধিত", Received: "প্রাপ্ত" },
  fr: { Wallet: "Portefeuille", Balance: "Solde", Room: "Salle", Rooms: "Salles", Friend: "Ami", Friends: "Amis", Settings: "Paramètres", Profile: "Profil", Photo: "Photo", Display: "Affichage", Language: "Langue", Currency: "Devise", Money: "Argent", Amount: "Montant", Total: "Total", Pending: "En attente", Recent: "Récent", Transactions: "Transactions", History: "Historique", Add: "Ajouter", Save: "Enregistrer", Delete: "Supprimer", Search: "Rechercher", Export: "Exporter", Download: "Télécharger", Send: "Envoyer", Create: "Créer", Login: "Connexion", Logout: "Déconnexion", Password: "Mot de passe", Email: "E-mail", Account: "Compte", Members: "Membres", Items: "Éléments", Expense: "Dépense", Expenses: "Dépenses", Settlement: "Règlement", Settlements: "Règlements", Notifications: "Notifications", Reminder: "Rappel", Reminders: "Rappels", Privacy: "Confidentialité", Default: "Défaut", Application: "Application", Current: "Actuel", Loading: "Chargement", Error: "Erreur", Paid: "Payé", Received: "Reçu" },
  es: { Wallet: "Cartera", Balance: "Saldo", Room: "Sala", Rooms: "Salas", Friend: "Amigo", Friends: "Amigos", Settings: "Ajustes", Profile: "Perfil", Photo: "Foto", Display: "Visualización", Language: "Idioma", Currency: "Moneda", Money: "Dinero", Amount: "Importe", Total: "Total", Pending: "Pendiente", Recent: "Reciente", Transactions: "Transacciones", History: "Historial", Add: "Añadir", Save: "Guardar", Delete: "Eliminar", Search: "Buscar", Export: "Exportar", Download: "Descargar", Send: "Enviar", Create: "Crear", Login: "Iniciar sesión", Logout: "Salir", Password: "Contraseña", Email: "Correo", Account: "Cuenta", Members: "Miembros", Items: "Ítems", Expense: "Gasto", Expenses: "Gastos", Settlement: "Liquidación", Settlements: "Liquidaciones", Notifications: "Notificaciones", Reminder: "Recordatorio", Reminders: "Recordatorios", Privacy: "Privacidad", Default: "Predeterminado", Application: "Aplicación", Current: "Actual", Loading: "Cargando", Error: "Error", Paid: "Pagado", Received: "Recibido" },
  de: { Wallet: "Wallet", Balance: "Guthaben", Room: "Raum", Rooms: "Räume", Friend: "Freund", Friends: "Freunde", Settings: "Einstellungen", Profile: "Profil", Photo: "Foto", Display: "Anzeige", Language: "Sprache", Currency: "Währung", Money: "Geld", Amount: "Betrag", Total: "Gesamt", Pending: "Ausstehend", Recent: "Aktuell", Transactions: "Transaktionen", History: "Verlauf", Add: "Hinzufügen", Save: "Speichern", Delete: "Löschen", Search: "Suchen", Export: "Exportieren", Download: "Herunterladen", Send: "Senden", Create: "Erstellen", Login: "Anmelden", Logout: "Abmelden", Password: "Passwort", Email: "E-Mail", Account: "Konto", Members: "Mitglieder", Items: "Einträge", Expense: "Ausgabe", Expenses: "Ausgaben", Settlement: "Abrechnung", Settlements: "Abrechnungen", Notifications: "Benachrichtigungen", Reminder: "Erinnerung", Reminders: "Erinnerungen", Privacy: "Datenschutz", Default: "Standard", Application: "App", Current: "Aktuell", Loading: "Laden", Error: "Fehler", Paid: "Bezahlt", Received: "Erhalten" },
  ar: { Wallet: "المحفظة", Balance: "الرصيد", Room: "غرفة", Rooms: "غرف", Friend: "صديق", Friends: "الأصدقاء", Settings: "الإعدادات", Profile: "الملف الشخصي", Photo: "صورة", Display: "عرض", Language: "اللغة", Currency: "العملة", Money: "المال", Amount: "المبلغ", Total: "الإجمالي", Pending: "معلّق", Recent: "حديث", Transactions: "المعاملات", History: "السجل", Add: "إضافة", Save: "حفظ", Delete: "حذف", Search: "بحث", Export: "تصدير", Download: "تنزيل", Send: "إرسال", Create: "إنشاء", Login: "تسجيل الدخول", Logout: "خروج", Password: "كلمة المرور", Email: "البريد", Account: "الحساب", Members: "الأعضاء", Items: "العناصر", Expense: "مصروف", Expenses: "مصروفات", Settlement: "تسوية", Settlements: "تسويات", Notifications: "إشعارات", Reminder: "تذكير", Reminders: "تذكيرات", Privacy: "الخصوصية", Default: "افتراضي", Application: "التطبيق", Current: "الحالي", Loading: "جار التحميل", Error: "خطأ", Paid: "مدفوع", Received: "مستلم" },
  ja: { Wallet: "ウォレット", Balance: "残高", Room: "ルーム", Rooms: "ルーム", Friend: "友達", Friends: "友達", Settings: "設定", Profile: "プロフィール", Photo: "写真", Display: "表示", Language: "言語", Currency: "通貨", Money: "お金", Amount: "金額", Total: "合計", Pending: "保留中", Recent: "最近", Transactions: "取引", History: "履歴", Add: "追加", Save: "保存", Delete: "削除", Search: "検索", Export: "エクスポート", Download: "ダウンロード", Send: "送信", Create: "作成", Login: "ログイン", Logout: "ログアウト", Password: "パスワード", Email: "メール", Account: "アカウント", Members: "メンバー", Items: "項目", Expense: "支出", Expenses: "支出", Settlement: "精算", Settlements: "精算", Notifications: "通知", Reminder: "リマインダー", Reminders: "リマインダー", Privacy: "プライバシー", Default: "デフォルト", Application: "アプリ", Current: "現在", Loading: "読み込み中", Error: "エラー", Paid: "支払い済み", Received: "受取済み" },
  zh: { Wallet: "钱包", Balance: "余额", Room: "房间", Rooms: "房间", Friend: "好友", Friends: "好友", Settings: "设置", Profile: "资料", Photo: "照片", Display: "显示", Language: "语言", Currency: "货币", Money: "金额", Amount: "金额", Total: "总计", Pending: "待处理", Recent: "最近", Transactions: "交易", History: "历史", Add: "添加", Save: "保存", Delete: "删除", Search: "搜索", Export: "导出", Download: "下载", Send: "发送", Create: "创建", Login: "登录", Logout: "退出", Password: "密码", Email: "邮箱", Account: "账户", Members: "成员", Items: "项目", Expense: "支出", Expenses: "支出", Settlement: "结算", Settlements: "结算", Notifications: "通知", Reminder: "提醒", Reminders: "提醒", Privacy: "隐私", Default: "默认", Application: "应用", Current: "当前", Loading: "加载中", Error: "错误", Paid: "已支付", Received: "已收到" },
  pt: { Wallet: "Carteira", Balance: "Saldo", Room: "Sala", Rooms: "Salas", Friend: "Amigo", Friends: "Amigos", Settings: "Configurações", Profile: "Perfil", Photo: "Foto", Display: "Exibição", Language: "Idioma", Currency: "Moeda", Money: "Dinheiro", Amount: "Valor", Total: "Total", Pending: "Pendente", Recent: "Recente", Transactions: "Transações", History: "Histórico", Add: "Adicionar", Save: "Salvar", Delete: "Excluir", Search: "Pesquisar", Export: "Exportar", Download: "Baixar", Send: "Enviar", Create: "Criar", Login: "Entrar", Logout: "Sair", Password: "Senha", Email: "E-mail", Account: "Conta", Members: "Membros", Items: "Itens", Expense: "Despesa", Expenses: "Despesas", Settlement: "Acerto", Settlements: "Acertos", Notifications: "Notificações", Reminder: "Lembrete", Reminders: "Lembretes", Privacy: "Privacidade", Default: "Padrão", Application: "Aplicativo", Current: "Atual", Loading: "Carregando", Error: "Erro", Paid: "Pago", Received: "Recebido" },
};

const originalTextNodes = new WeakMap<Text, string>();
const translatableAttributes: TranslatableAttribute[] = ["placeholder", "aria-label", "title"];
const skipSelector = "script, style, noscript, code, pre, textarea, input, svg";

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getReverseTranslation(value: string, language: AppLanguageCode) {
  const normalized = normalizeText(value);

  for (const [english, translations] of Object.entries(exactTranslations)) {
    if (translations[language] === normalized) {
      return english;
    }
  }

  return normalized;
}

function fallbackWordTranslate(text: string, language: AppLanguageCode) {
  if (language === "en") {
    return text;
  }

  const words = wordTranslations[language] ?? {};
  const translated = text.replace(/\b[A-Za-z][A-Za-z&'-]*\b/g, (token) => {
    const clean = token.replace(/[&]/g, "");
    return words[token] ?? words[clean] ?? token;
  });

  return translated === text ? text : translated;
}

export function translateUiText(value: string, language: AppLanguageCode) {
  if (language === "en") {
    return value;
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return value;
  }

  const english = getReverseTranslation(normalized, language);
  const exact = exactTranslations[english]?.[language];

  if (exact) {
    return value.replace(normalized, exact);
  }

  if (english.length <= 80) {
    return value.replace(normalized, fallbackWordTranslate(english, language));
  }

  return value;
}

function translateTextNode(textNode: Text, language: AppLanguageCode) {
  const current = textNode.data;

  if (!current.trim()) {
    return;
  }

  const parent = textNode.parentElement;
  if (!parent || parent.closest(skipSelector)) {
    return;
  }

  const storedOriginal = originalTextNodes.get(textNode);

  if (!storedOriginal) {
    originalTextNodes.set(textNode, getReverseTranslation(current, language));
  } else {
    const expectedCurrent =
      language === "en" ? storedOriginal : translateUiText(storedOriginal, language);

    /*
      React often reuses the same text node when a dropdown selected value
      changes. If we keep the first saved text forever, the translator can
      wrongly force the old selected value back into the UI. Example: app
      currency changes from SGD to INR, but the trigger text node is reused.
      When the visible text no longer matches the stored original or its
      translated version, treat it as new source text.
    */
    if (normalizeText(current) !== normalizeText(expectedCurrent)) {
      originalTextNodes.set(textNode, getReverseTranslation(current, language));
    }
  }

  const original = originalTextNodes.get(textNode) ?? current;
  const translated = language === "en" ? original : translateUiText(original, language);

  if (textNode.data !== translated) {
    textNode.data = translated;
  }
}

function translateElementAttributes(element: Element, language: AppLanguageCode) {
  if (element.closest(skipSelector) && !(element instanceof HTMLInputElement)) {
    return;
  }

  translatableAttributes.forEach((attribute) => {
    const value = element.getAttribute(attribute);

    if (!value?.trim()) {
      return;
    }

    const storeKey = `data-i18n-original-${attribute}`;
    if (!element.hasAttribute(storeKey)) {
      element.setAttribute(storeKey, getReverseTranslation(value, language));
    }

    const original = element.getAttribute(storeKey) ?? value;
    const translated = language === "en" ? original : translateUiText(original, language);

    if (translated !== value) {
      element.setAttribute(attribute, translated);
    }
  });
}

function translateTree(root: ParentNode, language: AppLanguageCode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    translateTextNode(current as Text, language);
    current = walker.nextNode();
  }

  if (root instanceof Element) {
    translateElementAttributes(root, language);
    root.querySelectorAll("[placeholder], [aria-label], [title]").forEach((element) => {
      translateElementAttributes(element, language);
    });
  } else if (root instanceof Document) {
    root.querySelectorAll("[placeholder], [aria-label], [title]").forEach((element) => {
      translateElementAttributes(element, language);
    });
  }
}

export function observeUiTranslations(language: AppLanguageCode) {
  if (typeof document === "undefined") {
    return () => undefined;
  }

  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.documentElement.dataset.appLanguage = language;
  translateTree(document.body, language);

  let scheduled = false;
  const scheduleTranslate = () => {
    if (scheduled) {
      return;
    }

    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      translateTree(document.body, language);
    });
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" || mutation.type === "characterData") {
        scheduleTranslate();
        return;
      }

      if (mutation.type === "attributes") {
        scheduleTranslate();
        return;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: translatableAttributes,
  });

  return () => observer.disconnect();
}
