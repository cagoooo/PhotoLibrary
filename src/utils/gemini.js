import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 將 File 物件轉換為 Gemini API 接受的 base64 格式
 * @param {File} file 
 * @returns {Promise<{ inlineData: { data: string, mimeType: string } }>}
 */
export function fileToGenerativePart(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // reader.result 會是 data:image/png;base64,... 格式，我們只需要 base64 資料部分
      const base64Data = reader.result.split(",")[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 呼叫 Gemini 2.5 Flash Lite 進行照片分析與腳本生成
 * @param {Array<File>} files - 照片檔案陣列
 * @param {string} activityTitle - 活動標題
 * @param {string} activityDescription - 活動詳細說明（選填）
 * @param {string} apiKey - Gemini API Key
 * @returns {Promise<Object>} - 產生的影片腳本 JSON
 */
export async function generateVideoScript(files, activityTitle, activityDescription = "", apiKey) {
  if (!apiKey) {
    throw new Error("請先設定 Gemini API Key");
  }
  if (!files || files.length === 0) {
    throw new Error("請至少上傳一張照片");
  }

  // 1. 初始化 Gemini SDK
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // 2. 依照 2026-06-16 最新選用規範，使用 gemini-2.5-flash-lite 模型
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  // 3. 將所有照片轉成 base64 parts
  const imageParts = await Promise.all(files.map(file => fileToGenerativePart(file)));

  // 4. 撰寫 Prompt，限制它返回特定 JSON 格式
  const prompt = `
你是一位專業的影片導演與腳本編劇。現在要請你分析一組活動紀錄照片，並為其編寫一部好看且前後連貫的活動成果影片腳本。

這組照片總共有 ${files.length} 張，已依照活動時間順序排列（照片 1 代表第一張，以此類推）。

【活動上下文資訊】
- 活動標題：${activityTitle || "未提供，請根據照片內容自動擬定"}
- 活動說明：${activityDescription || "未提供，請根據照片內容自動理解"}
- BGM_URLS: 建議從: gentle, inspiring, energetic, happy, cheerful, relaxed, epic, ambient, lofi, acoustic, retro 中選擇。

【任務與要求】
1. 觀察這組照片中正在發生的事情、人物動作、表情、物品以及所處的環境，理解整個活動的前因後果。
2. 根據活動主題，為整部影片擬定一個吸引人的「主標題」與「副標題」（副標題可以是活動日期或一句簡短總結）。
3. 推薦一個適合這部影片的背景音樂風格（必須從 gentle, inspiring, energetic, happy, cheerful, relaxed, epic, ambient, lofi, acoustic, retro 中選擇其一）。
4. 依序為每一張照片編寫旁白文字：
   - 旁白必須是積極、充滿活力、口語化、生動且溫暖吸引人的繁體中文。多使用振奮且富有成就感的正向口吻（如「我們迫不及待...」、「太棒了！」、「讓我們一起...」、「今天收穫滿滿！」）。
   - 每張照片的旁白字數控制在 15-20 字左右，念起來順暢，適合做成影片字幕。
   - ⚠️ **重要：請在語句中適度加入中文標點符號（如逗號『，』、驚嘆號『！』、頓號『、』），以提供自然的人聲呼吸停頓感，同時防止過長的中文字串因無停頓而導致微軟語音伺服器合成失敗 (NoAudioReceived 錯誤)。**
   - 旁白內容要前後呼應，讓整部影片像是在說一個完整的故事，不可只是死板板地描述照片物件（例如不要寫「這是一個戴帽子的人在看電腦」，而是寫「太棒了！我們開始在電腦上編寫屬於我們的第一個程式！」）。
5. 針對每張照片推薦一種 Ken Burns 鏡頭動效以增加影片的視覺動感，必須從以下候選中挑選：
      - zoom-in (微放大)
      - zoom-out (微縮小)
      - pan-left (向左平移)
      - pan-right (向右平移)
      - pan-up-zoom (向上平移+緩緩放大)
      - pan-down-zoom (向下平移+緩緩放大)
      - rotate-right (順時針微幅旋轉+慢速放大)
      - rotate-left (逆時針微幅旋轉+慢速放大)
6. 針對前後照片場景推薦一種合適的轉場效果，必須從以下候選中挑選以增加影片產出的多元性：
      - crossfade (淡入淡出 - 漸變)
      - slide-left (向左推入)
      - slide-right (向右推入)
      - slide-up (向上推入)
      - slide-down (向下推入)
      - zoom-transition (鏡頭縮放轉場)
      - fade-to-black (漸變黑屏轉場)
      第一個場景 (photoIndex 為 0) 固定為 crossfade，其餘場景請根據照片內容與故事節奏合理分配不同的轉場。
7. 設定每張照片的播放時長（建議 4-5 秒）。

【回傳格式】
你必須回傳一個符合 JSON Schema 的物件，嚴禁包含任何額外的 Markdown 標籤或文字說明。格式如下：
{
  "title": "影片主標題 (繁體中文)",
  "subtitle": "影片副標題 (繁體中文)",
  "bgmTheme": "音樂風格 (從 gentle, inspiring, energetic, happy, cheerful, relaxed, epic, ambient, lofi, acoustic, retro 中挑選)",
  "scenes": [
    {
      "photoIndex": 0,
      "narration": "第一張照片的旁白文字 (繁體中文，約 15-20 字)",
      "subtitle": "第一張照片的字幕 (通常與旁白一致，繁體中文)",
      "transition": "推薦的轉場效果 (從 crossfade, slide-left, slide-right, slide-up, slide-down, zoom-transition, fade-to-black 中挑選，首張固定為 crossfade)",
      "effect": "鏡頭動效 (從 zoom-in, zoom-out, pan-left, pan-right, pan-up-zoom, pan-down-zoom, rotate-right, rotate-left 中挑選)",
      "duration": 4
    },
    ...
  ]
}

請確保 scenes 陣列的長度剛好等於 ${files.length}，且 scenes 中的 photoIndex 對應照片陣列的索引（0 到 ${files.length - 1}）。
`;

  // 5. 呼叫 API
  try {
    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();
    
    // 解析 JSON
    const scriptData = JSON.parse(responseText);
    
    // 基本格式防禦
    if (!scriptData.title || !scriptData.scenes || scriptData.scenes.length !== files.length) {
      throw new Error("Gemini 回傳的腳本格式不符，請再試一次。");
    }
    
    return scriptData;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("生成腳本失敗：" + error.message);
  }
}

/**
 * 測試並驗證 Gemini API Key 是否有效
 * @param {string} apiKey - 待測試的 Gemini API Key
 * @returns {Promise<boolean>} - 是否驗證成功
 */
export async function testApiKey(apiKey) {
  if (!apiKey) {
    throw new Error("請先輸入金鑰再進行測試！");
  }
  
  const genAI = new GoogleGenerativeAI(apiKey);
  // 使用最輕巧的 gemini-2.5-flash-lite 模型
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
  
  try {
    // 發送一個極其簡單的 prompt
    const result = await model.generateContent("Hello. Respond with only 'OK' word.");
    const text = result.response.text().trim();
    if (text) {
      return true;
    }
    throw new Error("金鑰無回應，請確認格式。");
  } catch (error) {
    console.error("Gemini API Key Test Error:", error);
    throw new Error(error.message || "驗證失敗，請檢查金鑰是否正確。");
  }
}
