# 玉米家叫號網頁：正式版技術交接

> 給接手的 AI：請用繁體中文、台灣用語回覆。這份文件會放在**公開的** repo 裡，所以裡面不寫價格、不寫任何密碼。新增的檔案也一樣，不要寫進去。

## 背景

南機場夜市的炭烤玉米攤「玉米家」（CORN HOUSE），現在用一份 Google 文件叫號：老闆娘每叫一號就手動改文件上的數字，客人要自己重新整理才看得到。

這個 repo 要做的是**正式版叫號網頁**：老闆娘在手機上按一下，所有客人手機上的號碼即時更新。

- 示範版（純前端、不存資料）：https://neil-tech13.github.io/yumijia-demo/ ，repo 是 `Neil-tech13/yumijia-demo`。**那個 repo 不要動**，店家手上拿的是那個連結。
- 正式版的畫面和文案**沿用示範版的 `index.html`**，只把資料層換成 Firebase，再拆出店家頁。

## 架構

- **前端**：GitHub Pages，就是這個 repo，從 `main` 分支的根目錄部署，要有 `.nojekyll`。
- **資料**：Firebase Firestore（Spark 免費方案）。用 `onSnapshot` 即時監聽，不要用輪詢。
- **店家登入**：Firebase Authentication 的電子郵件/密碼登入。
- 不用 npm、不用打包工具。單純的 HTML 檔，Firebase SDK 從 `https://www.gstatic.com/firebasejs/<版本>/firebase-*.js` 用 ES module 載入，版本號要寫死成確切的版本。

### Firebase 設定（前端公開設定，不是機密）

```js
const firebaseConfig = {
  apiKey: "AIzaSyBCcaV-LdhrH_gGxiyX2wEhCiFqrX3mS4Q",
  authDomain: "yumijia-28c59.firebaseapp.com",
  projectId: "yumijia-28c59",
  storageBucket: "yumijia-28c59.firebasestorage.app",
  messagingSenderId: "695550465201",
  appId: "1:695550465201:web:11795c8faed1769f083e90"
};
```

### 資料結構

只有一份文件：`shops/yumijia`。欄位沿用示範版的 state：

```js
{
  shop: "玉米家", area: "南機場夜市",
  addr: "臺北市中正區中華路二段315巷5弄", phone: "0931 504 865", hours: "23:30",
  base: 15,      // 第一組大約要等幾分鐘
  per: 4,        // 每多一組加幾分鐘
  issued: 0,     // 今天已經發到幾號
  ready: [],     // 烤好、等客人來拿
  done: [],      // 已取餐
  cancel: [],    // 已取消
  day: "2026-10-28",                // 台北時間的日期，用來提醒「今天要從 1 號重新開始嗎」
  updated: <serverTimestamp>,
  undo: { issued, ready, done, cancel } | null   // 復原上一步用
}
```

- 「發下一號」要用 **transaction**，避免以後兩支手機同時按，發出重複的號碼。
- 文件不存在時，第一次店家登入要自動建立預設值。

### 安全規則（已經在 Firebase 後台發布，不用改）

```
match /shops/yumijia {
  allow read: if true;
  allow write: if request.auth != null
               && request.auth.token.email == 'staff@yumijia.app';
}
```

店家帳號的 email 是 `staff@yumijia.app`，**寫死在程式裡**，老闆娘登入時只輸入密碼。密碼不在這份文件裡，也不要要求使用者提供。

## 要做的頁面

### 1. 客人頁：`index.html`
- 沿用示範版「客人畫面」分頁的設計與內容：號碼牌票券、前面還有幾組、預估等候、玉米粒排隊圖、可取餐號碼、四語取餐須知、Google 評論按鈕、加 LINE 按鈕、口味與店家資訊。
- **只能看、不能改**，頁面上不能出現任何店家按鈕。
- 網址帶 `#n23` 時自動代入號碼，用 localStorage 記住。沒有號碼就顯示輸入框。
- 用 `onSnapshot` 即時更新，**把示範版每 60 秒重新整理一次的做法拿掉**。
- 斷線時顯示「連線中斷，正在重新連線」，不要顯示舊資料卻讓人以為是最新的。
- 拿掉示範版的「方案介紹」分頁和所有「示範模式」字樣。
- 加 LINE 按鈕：店家的 LINE 連結還沒拿到，先保留按鈕，連結設成可以在設定裡填的欄位，沒填就隱藏按鈕。

### 2. 店家頁：`staff.html`
- 沒登入時只顯示一個密碼輸入框（email 寫死），登入後保持登入狀態，老闆娘不用每天重新登入。
- 沿用示範版「店家叫號」分頁的功能：發下一號（跳出號碼牌和 QR）、點號碼多選、烤好了／取消／已取餐、復原上一步、今天從 1 號開始、號碼歸零（要按兩次確認）、設定（店名、營業時間、等候分鐘數、LINE 連結）。
- 攤位 QR 和號碼牌 QR 都指向**客人頁**的網址。號碼牌 QR 的格式是 `<客人頁網址>#n<號碼>`。
- 按鈕要大，方便在夜市一手拿夾子、一手按手機。
- 存檔失敗時要清楚提示，不要默默失敗。

## 限制
- **頁面上任何地方都不能出現「Claude」或「示範」字樣。**
- 不要升級 Firebase 方案，不要用到任何需要 Blaze 付費方案的功能，例如 Cloud Functions。
- 手機優先，要支援 iPhone Safari 和 Android Chrome。支援深色模式，沿用示範版的配色。
- 不要動 `Neil-tech13/yumijia-demo`。

## 完成的標準
1. 店家頁登入後按「發下一號」，另一支手機上的客人頁 2 秒內就會更新。
2. 沒登入的人直接用 Firestore 改資料會被規則擋下。
3. 客人頁重新整理後還記得自己的號碼。
4. 電腦和手機尺寸都沒有橫向捲軸。
5. 改完開 PR，說明改了什麼、要怎麼在手機上測試。
