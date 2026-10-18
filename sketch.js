/*
 * 題庫由 Google Sheets 提供，網站啟動時會在 preload() 讀取發布的 CSV。
 * 老師只需修改 GOOGLE_SHEET_ID 與 GOOGLE_SHEET_GID，重新整理網頁即可取得最新題目。
 * Google Sheets 必須開啟「知道連結的檢視者」或「發布到網路」，瀏覽器才可讀取。
 */

// ==================== Google Sheets 題庫設定 ====================
// 老師只需修改這兩個設定；GOOGLE_SHEET_ID 是試算表網址中的 ID，GID 是工作表分頁 ID。
const GOOGLE_SHEET_ID = 'R1xNZ2_ETrbq8mD_XRZXyqVTtrJW8dTEXoIo05WdWrisk';
const GOOGLE_SHEET_GID = '0';
// 加入時間戳，讓重新整理時盡量避開瀏覽器快取並取得 Google Sheets 最新內容。
const GOOGLE_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/e/2PACX-1vQKXjIsxmBS-X8wLi4YD0RAhPfAQzEXJO2kpj9aszqXHY2D4zv5AmJKZnxW6XgrkOM9zUlSz6aAOSqa/pub?gid=2141028955&single=true&output=csv`;

// p5.js preload() 載入完成後保存的試算表與題庫狀態。
let questionsTable = null;
let questionBank = [];
let questionDataReady = false;
let questionDataError = '題庫正在載入，請稍候。';
let questionDataLoadFailed = false;

// Google Sheets CSV 載入失敗時，讓畫布顯示清楚的繁體中文提示。
function handleQuestionTableLoadError() {
  questionDataLoadFailed = true;
  questionDataReady = false;
  questionDataError = '無法讀取 Google 試算表。請確認試算表已設為「知道連結的檢視者」或「發布到網路」，且網址設定正確。';
}

// 使用 p5.js preload() 讀取 Google Sheets 發布的 CSV；重新整理網頁會重新抓取最新內容。
function preload() {
  if (!GOOGLE_SHEET_ID || GOOGLE_SHEET_ID === 'REPLACE_WITH_YOUR_SHEET_ID') {
    questionDataLoadFailed = true;
    questionDataReady = false;
    questionDataError = '請先設定 Google 試算表 ID：請修改 sketch.js 的 GOOGLE_SHEET_ID。';
    return;
  }

  questionsTable = loadTable(
    GOOGLE_SHEET_CSV_URL,
    'csv',
    'header',
    () => {},
    handleQuestionTableLoadError
  );
}

// 將 Google Sheets 的 word、meaning 欄位轉成題庫陣列，並檢查資料格式與最低題數。
function prepareQuestionBank() {
  questionBank = [];
  questionDataReady = false;

  if (questionDataLoadFailed || !questionsTable) {
    if (!questionDataError) {
      questionDataError = '無法讀取 Google 試算表，請檢查試算表分享權限與設定。';
    }
    return;
  }

  // Google Sheet 第一列欄位名稱必須是 word,meaning。
  const columns = Array.isArray(questionsTable.columns) ? questionsTable.columns : [];
  if (!columns.includes('word') || !columns.includes('meaning')) {
    questionDataError = 'Google 試算表欄位錯誤：第一列必須是 word,meaning。';
    return;
  }

  try {
    // 每列去除前後空白，只加入 word 與 meaning 都有內容的資料。
    // 同一個英文單字只保留第一筆，確保抽題與四個選項都不會重複。
    const uniqueWords = new Set();
    for (const row of questionsTable.rows) {
      const rawWord = row.get('word');
      const rawMeaning = row.get('meaning');
      const word = rawWord === null || rawWord === undefined ? '' : String(rawWord).trim();
      const meaning = rawMeaning === null || rawMeaning === undefined ? '' : String(rawMeaning).trim();
      if (!word || !meaning || uniqueWords.has(word)) {
        continue;
      }

      uniqueWords.add(word);
      questionBank.push({ word, meaning });
    }
  } catch (error) {
    questionBank = [];
    questionDataError = 'Google 試算表內容無法解析，請確認 CSV 欄位與資料格式。';
    return;
  }

  if (questionBank.length < QUIZ_LENGTH) {
    questionDataError = `Google 試算表有效題目不足，至少需要 ${QUIZ_LENGTH} 題，目前只有 ${questionBank.length} 題。`;
    return;
  }

  questionDataReady = true;
  questionDataError = '';
}

// ==================== 全域設定與遊戲狀態 ====================
// 設定畫布、介面與答題動畫使用的固定色彩。
const COLORS = {
  background: '#ffe5d9',
  questionBackground: '#feeac7',
  text: '#3d405b',
  secondaryText: '#6d6875',
  white: '#ffffff',
  button: '#f4acb7',
  buttonHover: '#e5989b',
  correctSelected: '#caf0f8',
  wrongSelected: '#ff8fa3',
  correctAnswer: '#ade8f4',
  border: '#3d405b'
};

// 設定每次測驗的題數、滿分與答題回饋動畫時間。
const QUIZ_LENGTH = 5;
const MAX_SCORE = 100;
const SCORE_PER_QUESTION = MAX_SCORE / QUIZ_LENGTH;
const PASSING_SCORE = 60;
const ANIMATION_DURATION = 1400;

// Canvas 文字字型設定：中文與題目使用 LXGW WenKai Mono TC，英文使用 Patrick Hand。
// 字型若尚未載入或外部資源失敗，仍會由指定的系統 fallback 安全繪製。
const CHINESE_FONT = 'LXGW WenKai Mono TC';
const ENGLISH_FONT = 'Patrick Hand';
const CHINESE_FONT_FALLBACK = 'LXGW WenKai Mono TC, sans-serif';
const ENGLISH_FONT_FALLBACK = 'Patrick Hand, Comic Sans MS, Arial Rounded MT Bold, sans-serif';
const ENCOURAGEMENT_FONT = ENGLISH_FONT;
let fontsReady = false;

// 每次文字測量與繪製前都重新指定字型與粗細，避免 p5.js 沿用上一段文字的設定。
function setChineseFont(weight = NORMAL) {
  textFont(CHINESE_FONT);
  textStyle(weight);
  if (drawingContext) {
    drawingContext.font = `${weight === BOLD ? 'bold' : 'normal'} 32px \"${CHINESE_FONT}\", sans-serif`;
  }
}

function setEnglishFont(weight = NORMAL) {
  textFont(ENGLISH_FONT);
  textStyle(weight);
  if (drawingContext) {
    drawingContext.font = `${weight === BOLD ? 'bold' : 'normal'} 32px \"${ENGLISH_FONT}\", \"Comic Sans MS\", \"Arial Rounded MT Bold\", sans-serif`;
  }
}

function setCanvasFontVariables() {
  document.documentElement.style.setProperty('--font-chinese', `"${CHINESE_FONT}", sans-serif`);
  document.documentElement.style.setProperty('--font-english', `"${ENGLISH_FONT}", "Comic Sans MS", "Arial Rounded MT Bold", sans-serif`);
  if (canvas && canvas.elt) {
    canvas.elt.style.fontFamily = `"${CHINESE_FONT}", sans-serif`;
  }
}

function setRequestedFontForCanvas(fontKind, weight = NORMAL) {
  if (fontKind === 'english') {
    setEnglishFont(weight);
  } else {
    setChineseFont(weight);
  }
}

function loadRequestedFontsSafely() {
  const fontPromises = [
    document.fonts.load('700 32px "LXGW WenKai Mono TC"'),
    document.fonts.load('400 32px "LXGW WenKai Mono TC"'),
    document.fonts.load('400 32px "Patrick Hand"')
  ];

  Promise.allSettled(fontPromises).then(() => {
    // 即使 Google Fonts 無法連線，也標記流程完成並使用 CSS／瀏覽器 fallback 繼續繪製。
    fontsReady = true;
    redraw();
  }).catch(() => {
    fontsReady = true;
    redraw();
  });
}

// 保存成績頁專用的 Canvas 特效狀態；特效不會在開始頁或答題頁更新。
let fireworkRockets = [];
let fireworkBursts = [];
let encouragementParticles = [];
let resultEffectReady = false;
let lastFireworkSpawnTime = 0;

// 以畫面狀態控制開始頁、作答頁與成績頁。
let screenState = 'start';

// 保存本次測驗的題目、目前題號、分數與選項狀態。
let quizQuestions = [];
let questionIndex = 0;
let score = 0;
let currentOptions = [];
let selectedOptionIndex = -1;
let answerSubmitted = false;
let answerTime = 0;

// 保存最近一次輸入時間，避免觸控事件和合成滑鼠事件重複作答。
let lastInputTime = -Infinity;
const INPUT_DEBOUNCE_MS = 350;

// 保存依畫布尺寸計算出的全部版面資料；縮放時只更新這份資料，不重設測驗狀態。
let layout = {};

// ==================== p5.js 生命週期函式 ====================
// 使用瀏覽器視窗寬高建立全螢幕畫布，並設定一致的繪圖模式。
function setup() {
  // 在 canvas 建立後立即設定全域 CSS 字型變數與 canvas 的安全 fallback。
  createCanvas(windowWidth, windowHeight);
  // preload() 已完成後，將 CSV rows 轉成可供測驗使用的 questionBank。
  prepareQuestionBank();
  setCanvasFontVariables();
  rectMode(CENTER);
  textAlign(CENTER, CENTER);
  setChineseFont(NORMAL);
  noStroke();
  calculateLayout();
  resetResultEffects();

  // 精確等待指定字重；每個 Promise 都安全處理，Google Fonts 失敗不會中斷 p5.js。
  if (document.fonts && typeof document.fonts.load === 'function') {
    loadRequestedFontsSafely();
  } else {
    fontsReady = true;
    redraw();
  }
}

// 每一幀重繪背景與目前畫面，答題回饋動畫也在此持續更新。
function draw() {
  background(COLORS.background);

  if (screenState === 'start') {
    drawStartScreen();
  } else if (screenState === 'quiz') {
    drawQuizScreen();
  } else if (screenState === 'result') {
    drawResultScreen();
  }
}

// 視窗尺寸改變時只調整畫布與版面，保留目前題目、答案、分數及動畫狀態。
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  calculateLayout();
}

// 滑鼠與觸控共用同一個事件入口，確保繪製區域與命中區域完全一致。
function mousePressed() {
  if (millis() - lastInputTime < INPUT_DEBOUNCE_MS) {
    return false;
  }

  lastInputTime = millis();
  handleCanvasInput(mouseX, mouseY);
  return false;
}

// 行動裝置沒有可靠產生合成滑鼠事件時，直接用畫布座標處理觸控。
function touchStarted() {
  if (millis() - lastInputTime < INPUT_DEBOUNCE_MS) {
    return false;
  }

  lastInputTime = millis();
  handleCanvasInput(mouseX, mouseY);
  return false;
}

// 依目前畫面狀態處理開始、選項、下一題與再測一次的點擊。
function handleCanvasInput(inputX, inputY) {
  if (screenState === 'start') {
    if (isPointInsideRect(inputX, inputY, getStartButtonRect())) {
      if (questionDataReady) {
        startQuiz();
      }
    }
    return;
  }

  if (screenState === 'quiz') {
    if (!answerSubmitted) {
      // 尚未作答時，四個選項的命中區域就是尚未移動的實際繪製矩形。
      const optionRects = getOptionRects();
      for (let i = 0; i < optionRects.length; i += 1) {
        if (isPointInsideRect(inputX, inputY, optionRects[i])) {
          submitAnswer(i);
          break;
        }
      }
    } else if (isPointInsideRect(inputX, inputY, getNextButtonRect())) {
      // 作答後只接受下一題或查看成績，避免同一題再次改變結果。
      goToNextQuestion();
    }
    return;
  }

  if (screenState === 'result' && isPointInsideRect(inputX, inputY, getRestartButtonRect())) {
    startQuiz();
  }
}

// ==================== 測驗流程 ====================
// 洗牌題庫後取出五個不同單字，並準備第一題的四個選項。
function startQuiz() {
  // 題庫未通過檢查時不可開始，錯誤訊息會留在開始頁 Canvas 上。
  if (!questionDataReady || questionBank.length < QUIZ_LENGTH) {
    questionDataReady = false;
    questionDataError = questionDataError || `題庫尚未準備完成，至少需要 ${QUIZ_LENGTH} 題。`;
    screenState = 'start';
    return;
  }

  // 每次開始或再測一次都從已載入的 Google Sheets 題庫隨機抽出 5 題，且同一次不重複。
  quizQuestions = shuffleArray(questionBank).slice(0, QUIZ_LENGTH);
  questionIndex = 0;
  score = 0;
  screenState = 'quiz';
  resetResultEffects();
  prepareCurrentQuestion();
}

// 根據目前題目建立一個正確答案與三個不同干擾選項，再次洗牌選項順序。
function prepareCurrentQuestion() {
  const currentQuestion = quizQuestions[questionIndex];
  // 只取英文單字不重複的干擾選項，確保每題有三個不同答案。
  const seenWords = new Set([currentQuestion.word]);
  const distractors = [];
  for (const item of shuffleArray(questionBank)) {
    if (!seenWords.has(item.word)) {
      seenWords.add(item.word);
      distractors.push(item);
    }
    if (distractors.length === 3) {
      break;
    }
  }

  currentOptions = shuffleArray([currentQuestion, ...distractors]);
  selectedOptionIndex = -1;
  answerSubmitted = false;
  answerTime = 0;
}

// 判斷被選的選項是否正確，更新分數並啟動短時間的視覺回饋動畫。
function submitAnswer(optionIndex) {
  if (answerSubmitted || optionIndex < 0 || optionIndex >= currentOptions.length) {
    return;
  }

  selectedOptionIndex = optionIndex;
  answerSubmitted = true;
  answerTime = millis();

  if (currentOptions[optionIndex].word === quizQuestions[questionIndex].word) {
    score += 1;
  }
}

// 作答後前往下一題；第五題則切換到成績頁。
function goToNextQuestion() {
  if (!answerSubmitted) {
    return;
  }

  if (questionIndex < QUIZ_LENGTH - 1) {
    questionIndex += 1;
    prepareCurrentQuestion();
  } else {
    screenState = 'result';
    initializeResultEffects();
  }
}

// 使用 Fisher-Yates 演算法回傳新的洗牌陣列，不改動原始題庫順序。
function shuffleArray(sourceArray) {
  const shuffled = [...sourceArray];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const randomIndex = floor(random(i + 1));
    [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
  }
  return shuffled;
}

// ==================== 響應式版面計算 ====================
// 依畫布方向、寬高與安全邊界計算所有頁面的位置和尺寸。
function calculateLayout() {
  const canvasWidth = max(1, width);
  const canvasHeight = max(1, height);
  const shortSide = min(canvasWidth, canvasHeight);
  const isLandscape = canvasWidth > canvasHeight;
  const safeMargin = constrain(shortSide * 0.04, 10, 36);
  const contentWidth = min(max(1, canvasWidth - safeMargin * 2), 1080);
  const contentLeft = (canvasWidth - contentWidth) / 2;

  layout = {
    canvasWidth,
    canvasHeight,
    isLandscape,
    safeMargin,
    contentWidth,
    contentLeft,
    start: calculateStartLayout(canvasWidth, canvasHeight, contentWidth, safeMargin),
    quiz: calculateQuizLayout(
      canvasWidth,
      canvasHeight,
      contentWidth,
      contentLeft,
      safeMargin,
      isLandscape
    ),
    result: calculateResultLayout(canvasWidth, canvasHeight, contentWidth, safeMargin)
  };
}

// 計算開始頁的群組版面，以整組內容置中避免短螢幕下按鈕被裁切。
function calculateStartLayout(canvasWidth, canvasHeight, contentWidth, safeMargin) {
  const titleSize = constrain(min(contentWidth * 0.075, canvasHeight * 0.11), 28, 64);
  const subtitleSize = constrain(min(contentWidth * 0.034, canvasHeight * 0.055), 15, 25);
  const buttonHeight = constrain(min(canvasHeight * 0.12, contentWidth * 0.18), 48, 76);
  const buttonWidth = min(contentWidth * 0.66, 340);
  const groupGap = constrain(canvasHeight * 0.025, 8, 20);
  const titleBlock = titleSize * 1.25;
  const subtitleLineHeight = subtitleSize * 1.35;
  const subtitleBlock = subtitleLineHeight * 2;
  const groupHeight = titleBlock + groupGap + subtitleBlock + groupGap * 1.35 + buttonHeight;
  const top = max(safeMargin, (canvasHeight - groupHeight) / 2);
  const titleY = top + titleBlock / 2;
  const firstSubtitleY = top + titleBlock + groupGap + subtitleLineHeight / 2;
  const secondSubtitleY = firstSubtitleY + subtitleLineHeight;
  const buttonY = secondSubtitleY + subtitleLineHeight / 2 + groupGap * 1.35 + buttonHeight / 2;

  return {
    titleSize,
    subtitleSize,
    titleY,
    firstSubtitleY,
    secondSubtitleY,
    button: { x: canvasWidth / 2, y: buttonY, w: buttonWidth, h: buttonHeight }
  };
}

// 計算成績頁的群組版面，讓成績與再測一次按鈕在各種高度都能完整顯示。
function calculateResultLayout(canvasWidth, canvasHeight, contentWidth, safeMargin) {
  // 預留兩行英文鼓勵文字，讓低分結果在手機直向、橫向與桌機都能完整顯示。
  const baseTitleSize = constrain(min(contentWidth * 0.07, canvasHeight * 0.090), 24, 58);
  const baseLabelSize = constrain(min(contentWidth * 0.038, canvasHeight * 0.046), 15, 26);
  const baseScoreSize = constrain(min(contentWidth * 0.13, canvasHeight * 0.130), 44, 94);
  const baseDetailSize = constrain(min(contentWidth * 0.040, canvasHeight * 0.048), 15, 28);
  const baseMessageSize = constrain(min(contentWidth * 0.044, canvasHeight * 0.050), 17, 31);
  const baseEncouragementSize = constrain(min(contentWidth * 0.085, canvasHeight * 0.090), 27, 56);
  const baseButtonHeight = constrain(min(canvasHeight * 0.105, contentWidth * 0.17), 44, 72);
  const buttonWidth = min(contentWidth * 0.66, 340);
  const baseGap = constrain(canvasHeight * 0.016, 5, 15);
  const titleBlock = baseTitleSize * 1.18;
  const labelBlock = baseLabelSize * 1.22;
  const scoreBlock = baseScoreSize * 1.04;
  const detailBlock = baseDetailSize * 1.22;
  const messageBlock = baseMessageSize * 1.22;
  const encouragementBlock = baseEncouragementSize * 1.12;
  const baseGroupHeight = (
    titleBlock + baseGap + labelBlock + baseGap * 0.65 + scoreBlock +
    baseGap * 0.55 + detailBlock + baseGap * 0.60 + messageBlock +
    baseGap * 0.38 + encouragementBlock + baseGap * 0.18 + encouragementBlock +
    baseGap * 0.85 + baseButtonHeight
  );
  const availableHeight = max(1, canvasHeight - safeMargin * 2);
  const fitRatio = min(1, availableHeight / baseGroupHeight);
  const titleSize = baseTitleSize * fitRatio;
  const labelSize = baseLabelSize * fitRatio;
  const scoreSize = baseScoreSize * fitRatio;
  const detailSize = baseDetailSize * fitRatio;
  const messageSize = baseMessageSize * fitRatio;
  const encouragementSize = baseEncouragementSize * fitRatio;
  const buttonHeight = baseButtonHeight * fitRatio;
  const gap = baseGap * fitRatio;
  const scaledTitleBlock = titleBlock * fitRatio;
  const scaledLabelBlock = labelBlock * fitRatio;
  const scaledScoreBlock = scoreBlock * fitRatio;
  const scaledDetailBlock = detailBlock * fitRatio;
  const scaledMessageBlock = messageBlock * fitRatio;
  const scaledEncouragementBlock = encouragementBlock * fitRatio;
  const groupHeight = baseGroupHeight * fitRatio;
  const top = max(safeMargin, (canvasHeight - groupHeight) / 2);
  const titleY = top + scaledTitleBlock / 2;
  const labelY = titleY + scaledTitleBlock / 2 + gap + scaledLabelBlock / 2;
  const scoreY = labelY + scaledLabelBlock / 2 + gap * 0.65 + scaledScoreBlock / 2;
  const detailY = scoreY + scaledScoreBlock / 2 + gap * 0.55 + scaledDetailBlock / 2;
  const messageY = detailY + scaledDetailBlock / 2 + gap * 0.60 + scaledMessageBlock / 2;
  const encouragementOneY = messageY + scaledMessageBlock / 2 + gap * 0.38 + scaledEncouragementBlock / 2;
  const encouragementTwoY = encouragementOneY + scaledEncouragementBlock / 2 + gap * 0.18 + scaledEncouragementBlock / 2;
  const buttonY = encouragementTwoY + scaledEncouragementBlock / 2 + gap * 0.85 + buttonHeight / 2;

  return {
    titleSize,
    labelSize,
    scoreSize,
    detailSize,
    messageSize,
    encouragementSize,
    titleY,
    labelY,
    scoreY,
    detailY,
    messageY,
    encouragementOneY,
    encouragementTwoY,
    button: { x: canvasWidth / 2, y: buttonY, w: buttonWidth, h: buttonHeight }
  };
}

// 計算作答頁版面；窄直向畫布使用單欄，其餘橫向畫布使用兩欄。
function calculateQuizLayout(canvasWidth, canvasHeight, contentWidth, contentLeft, safeMargin, isLandscape) {
  const oneColumn = !isLandscape && canvasWidth < 700;
  const columns = oneColumn ? 1 : 2;
  const rows = ceil(4 / columns);
  const titleSize = constrain(min(contentWidth * 0.055, canvasHeight * 0.10), 20, 42);
  const progressSize = constrain(min(contentWidth * 0.030, canvasHeight * 0.058), 12, 22);
  const questionMaxSize = constrain(min(contentWidth * 0.050, canvasHeight * 0.085), 17, 32);
  const optionMaxSize = constrain(min(contentWidth * 0.040, canvasHeight * 0.060), 15, 27);
  const headerGap = constrain(min(canvasWidth, canvasHeight) * 0.018, 5, 15);
  let gap = constrain(min(canvasWidth, canvasHeight) * 0.022, 6, 18);
  const optionWidth = columns === 1 ? contentWidth : (contentWidth - gap) / 2;
  let questionHeight = constrain(canvasHeight * (oneColumn ? 0.13 : 0.19), 44, 106);
  let optionHeight = constrain(canvasHeight * (oneColumn ? 0.09 : 0.18), 40, 84);
  let nextButtonHeight = constrain(canvasHeight * 0.09, 42, 68);
  const titleY = safeMargin + titleSize / 2;
  const progressY = titleY + titleSize / 2 + headerGap + progressSize / 2;
  const questionTop = progressY + progressSize / 2 + headerGap;
  const availableHeight = max(1, canvasHeight - safeMargin - questionTop);
  let totalHeight = questionHeight + rows * optionHeight + nextButtonHeight + (rows + 1) * gap;

  // 高度不足時同比縮小題目、選項、按鈕與間距，優先確保所有元件仍在畫布內。
  if (totalHeight > availableHeight) {
    const fitRatio = availableHeight / totalHeight;
    questionHeight *= fitRatio;
    optionHeight *= fitRatio;
    nextButtonHeight *= fitRatio;
    gap *= fitRatio;
  }

  const optionStartY = questionTop + questionHeight + gap + optionHeight / 2;
  const optionRects = [];
  for (let i = 0; i < 4; i += 1) {
    const row = floor(i / columns);
    const column = i % columns;
    const x = columns === 1
      ? canvasWidth / 2
      : contentLeft + optionWidth / 2 + column * (optionWidth + gap);
    const y = optionStartY + row * (optionHeight + gap);
    optionRects.push({ x, y, w: optionWidth, h: optionHeight });
  }

  const bottomOption = optionRects[optionRects.length - 1];
  const nextButton = {
    x: canvasWidth / 2,
    y: bottomOption.y + bottomOption.h / 2 + gap + nextButtonHeight / 2,
    w: min(contentWidth * 0.48, 290),
    h: nextButtonHeight
  };

  return {
    oneColumn,
    columns,
    rows,
    titleSize,
    progressSize,
    questionMaxSize,
    optionMaxSize,
    titleY,
    progressY,
    questionY: questionTop + questionHeight / 2,
    questionWidth: contentWidth,
    questionHeight,
    optionRects,
    optionGap: gap,
    optionHeight,
    nextButton
  };
}

// ==================== 畫面繪製 ====================
// 繪製初始畫面、標題、操作提示與開始測驗按鈕。
function drawStartScreen() {
  const start = layout.start;

  // 開始頁標題、說明與按鈕標籤都是中文，使用中文字型。
  setChineseFont(BOLD);
  fill(COLORS.text);
  textSize(start.titleSize);
  text(`英語字彙小測驗`, width / 2, start.titleY);

  setChineseFont(NORMAL);
  fill(COLORS.secondaryText);
  textSize(start.subtitleSize);
  text(`每次五題，每題四個選項`, width / 2, start.firstSubtitleY);
  text(`準備好了就開始吧！`, width / 2, start.secondSubtitleY);

  // Google Sheets 題庫未準備好時，直接在 Canvas 顯示繁體中文錯誤，避免程式崩潰。
  if (!questionDataReady) {
    fill('#c9184a');
    drawFittedText(
      questionDataError || `題庫尚未準備完成，請稍候。`,
      width / 2,
      min(height - layout.safeMargin - start.subtitleSize, start.button.y + start.button.h / 2 + start.subtitleSize * 1.35),
      layout.contentWidth * 0.92,
      start.subtitleSize * 2.2,
      start.subtitleSize,
      10,
      'chinese',
      NORMAL
    );
  } else {
    fill('#168aad');
    textSize(max(11, start.subtitleSize * 0.82));
    text(`題庫已載入 ${questionBank.length} 題`, width / 2, start.button.y + start.button.h / 2 + start.subtitleSize * 1.15);
  }

  // 題庫未準備好時以非強調樣式顯示按鈕，實際點擊也會被 handleCanvasInput 擋下。
  drawButton(start.button, `開始測驗`, questionDataReady);
}

// 繪製作答頁的標題、題號、中文題目、四個選項與下一題按鈕。
function drawQuizScreen() {
  const currentQuestion = quizQuestions[questionIndex];
  const quiz = layout.quiz;

  // 題目頁的標題、進度與中文題幹使用中文字型。
  setChineseFont(BOLD);
  fill(COLORS.text);
  textSize(quiz.titleSize);
  text(`英語字彙小測驗`, width / 2, quiz.titleY);

  setChineseFont(NORMAL);
  fill(COLORS.secondaryText);
  textSize(quiz.progressSize);
  text(`第 ${questionIndex + 1} 題／共 ${QUIZ_LENGTH} 題`, width / 2, quiz.progressY);

  // 繪製響應式題目方框，尺寸、位置與圓角沿用依畫布計算的版面資料。
  push();
  fill(COLORS.questionBackground);
  stroke(COLORS.border);
  strokeWeight(max(1, min(2, quiz.questionHeight * 0.035)));
  rect(
    width / 2,
    quiz.questionY,
    quiz.questionWidth,
    quiz.questionHeight,
    min(quiz.questionHeight * 0.20, 18)
  );
  pop();

  fill(COLORS.text);
  setChineseFont(BOLD);
  drawFittedText(
    `下列哪一個英文單字代表：「${currentQuestion.meaning}」？`,
    width / 2,
    quiz.questionY,
    quiz.questionWidth * 0.96,
    quiz.questionHeight * 0.92,
    quiz.questionMaxSize,
    max(11, quiz.questionMaxSize * 0.52),
    'chinese',
    BOLD
  );
  setChineseFont(NORMAL);

  drawOptions();

  // 預留並繪製下一題按鈕，確保按鈕出現時不會推動或裁切其他元件。
  if (answerSubmitted) {
    drawButton(
      getNextButtonRect(),
      questionIndex === QUIZ_LENGTH - 1 ? `查看成績` : `下一題`,
      true
    );
  }
}

// 繪製四個可點擊選項，並依作答結果套用指定背景色與短暫動畫。
function drawOptions() {
  const quiz = layout.quiz;
  const correctIndex = currentOptions.findIndex(
    (item) => item.word === quizQuestions[questionIndex].word
  );
  const elapsed = answerSubmitted ? millis() - answerTime : 0;

  for (let i = 0; i < quiz.optionRects.length; i += 1) {
    let fillColor = COLORS.white;
    let offsetX = 0;
    let offsetY = 0;

    if (answerSubmitted) {
      const animationAmount = getAnimationAmount(elapsed);
      const isCorrectChoice = i === correctIndex;
      const isSelectedChoice = i === selectedOptionIndex;

      // 答對：被選項使用淡藍色並上下跳動。
      if (isSelectedChoice && isCorrectChoice) {
        fillColor = COLORS.correctSelected;
        offsetY = sin(frameCount * 0.35) * quiz.optionHeight * 0.10 * animationAmount;
      }

      // 答錯：被選項使用粉紅色並左右移動。
      if (isSelectedChoice && !isCorrectChoice) {
        fillColor = COLORS.wrongSelected;
        offsetX = sin(frameCount * 0.45) * quiz.optionHeight * 0.10 * animationAmount;
      }

      // 答錯時，正確答案使用另一種藍色並上下跳動。
      if (!isSelectedChoice && isCorrectChoice) {
        fillColor = COLORS.correctAnswer;
        offsetY = sin(frameCount * 0.35 + 0.8) * quiz.optionHeight * 0.10 * animationAmount;
      }
    }

    const displayedRect = getDisplayedOptionRect(i, offsetX, offsetY);
    drawOptionButton(displayedRect, currentOptions[i].word, fillColor, quiz.optionMaxSize);
  }
}

// 繪製成績頁，顯示答對題數、百分比與再測一次按鈕。
function drawResultScreen() {
  const result = layout.result;
  const finalScore = round((score / QUIZ_LENGTH) * MAX_SCORE);
  // 成績頁的中文標題、分數說明與中文回饋使用中文字型。
  setChineseFont(NORMAL);
  const reachedGoal = finalScore >= PASSING_SCORE;

  // 特效先畫在背景層，讓成績、鼓勵文字與按鈕維持清楚且不影響點擊。
  drawResultEffect(reachedGoal);

  fill(COLORS.text);
  setChineseFont(BOLD);
  textSize(result.titleSize);
  text(`測驗完成！`, width / 2, result.titleY);

  setChineseFont(NORMAL);
  fill(COLORS.secondaryText);
  textSize(result.labelSize);
  text(`答對題數`, width / 2, result.labelY);

  fill(COLORS.text);
  setChineseFont(BOLD);
  textSize(result.scoreSize);
  text(`${score}／${QUIZ_LENGTH}`, width / 2, result.scoreY);

  fill(COLORS.secondaryText);
  setChineseFont(NORMAL);
  textSize(result.detailSize);
  text(`100 分制成績：${finalScore}／${MAX_SCORE}`, width / 2, result.detailY);

  fill(reachedGoal ? '#168aad' : '#d66d2f');
  setChineseFont(BOLD);
  textSize(result.messageSize);
  text(reachedGoal ? `達標！太棒了！` : `繼續加油，再接再厲！`, width / 2, result.messageY);

  // 未達 60 分時，兩句英文以同一個群組同步左右搖晃、旋轉與誇張放大縮小。
  if (!reachedGoal) {
    drawAnimatedEncouragementGroup(
      `You can do it!`,
      `Practice makes perfect!`,
      width / 2,
      result.encouragementOneY,
      result.encouragementTwoY,
      layout.contentWidth * 0.92,
      max(1, result.button.y - result.messageY),
      result.encouragementSize,
      '#c9184a'
    );
  }

  drawButton(result.button, `再測一次`, true);
  textStyle(NORMAL);
}

// 繪製一般按鈕；按鈕矩形同時就是滑鼠與觸控的實際命中區域。
function drawButton(buttonRect, label, emphasized) {
  // 一般按鈕目前使用中文介面文字，明確套用中文字型。
  setChineseFont(BOLD);
  push();
  translate(buttonRect.x, buttonRect.y);
  drawingContext.shadowColor = 'rgba(61, 64, 91, 0.18)';
  drawingContext.shadowBlur = max(3, min(10, buttonRect.h * 0.16));
  drawingContext.shadowOffsetY = max(1, buttonRect.h * 0.06);
  fill(emphasized ? COLORS.button : COLORS.white);
  stroke(COLORS.border);
  strokeWeight(max(1, min(2, buttonRect.h * 0.035)));
  rect(0, 0, buttonRect.w, buttonRect.h, min(buttonRect.h * 0.25, 18));
  drawingContext.shadowColor = 'transparent';
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetY = 0;
  noStroke();
  fill(COLORS.text);
  setChineseFont(BOLD);
  drawFittedText(label, 0, 0, buttonRect.w * 0.82, buttonRect.h * 0.72, buttonRect.h * 0.42, 10, 'chinese', BOLD);
  pop();
  textStyle(NORMAL);
}

// 繪製單一選項；傳入的矩形已包含動畫位移，因此和畫面上的實際區域一致。
function drawOptionButton(optionRect, label, fillColor, maxTextSize) {
  // 選項是英文單字，使用 Patrick Hand 及指定英文 fallback。
  setEnglishFont(BOLD);
  push();
  drawingContext.shadowColor = 'rgba(61, 64, 91, 0.16)';
  drawingContext.shadowBlur = max(3, min(8, optionRect.h * 0.13));
  drawingContext.shadowOffsetY = max(1, optionRect.h * 0.045);
  fill(fillColor);
  stroke(COLORS.border);
  strokeWeight(max(1, min(2, optionRect.h * 0.035)));
  rect(optionRect.x, optionRect.y, optionRect.w, optionRect.h, min(optionRect.h * 0.20, 18));
  drawingContext.shadowColor = 'transparent';
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetY = 0;
  noStroke();
  fill(COLORS.text);
  setEnglishFont(BOLD);
  drawFittedText(
    label,
    optionRect.x,
    optionRect.y,
    optionRect.w * 0.84,
    optionRect.h * 0.72,
    maxTextSize,
    max(10, maxTextSize * 0.50),
    'english',
    BOLD
  );
  pop();
  textStyle(NORMAL);
}

// ==================== 成績頁 Canvas 特效 ====================
// 清空所有特效粒子；重新開始測驗時呼叫，避免特效狀態帶到下一次測驗。
function resetResultEffects() {
  fireworkRockets = [];
  fireworkBursts = [];
  encouragementParticles = [];
  resultEffectReady = false;
  lastFireworkSpawnTime = 0;
}

// 第一次進入成績頁時建立特效粒子，讓畫面立即有回饋而不必等待。
function initializeResultEffects() {
  resetResultEffects();
  resultEffectReady = true;
  lastFireworkSpawnTime = millis();

  const finalScore = round((score / QUIZ_LENGTH) * MAX_SCORE);
  if (finalScore >= PASSING_SCORE) {
    // 初始同時放出多枚不同區域火箭，之後再由時間錯開持續補上。
    for (let i = 0; i < 9; i += 1) {
      spawnFireworkRocket(true);
    }
  } else {
    for (let i = 0; i < 34; i += 1) {
      encouragementParticles.push(createEncouragementParticle(true));
    }
  }
}

// 依滿分狀態繪製煙火或加油特效；離開成績頁後不會執行此函式。
function drawResultEffect(reachedGoal) {
  if (!resultEffectReady) {
    initializeResultEffects();
  }

  if (reachedGoal) {
    updateAndDrawFireworks();
  } else {
    updateAndDrawEncouragement();
  }
}

// 建立一枚由畫面下方升向隨機高度的煙火火箭。
function spawnFireworkRocket(initialBurst) {
  // 分散設定多個高度區域，讓煙火出現在畫布上方、中間、兩側與下方。
  const palette = ['#ff1744', '#ff6d00', '#ffd600', '#00e676', '#00b0ff', '#7c4dff', '#ff4081'];
  const zones = [
    { minX: 0.08, maxX: 0.30, minY: 0.16, maxY: 0.42 },
    { minX: 0.28, maxX: 0.52, minY: 0.10, maxY: 0.34 },
    { minX: 0.48, maxX: 0.72, minY: 0.18, maxY: 0.48 },
    { minX: 0.70, maxX: 0.92, minY: 0.12, maxY: 0.40 },
    { minX: 0.16, maxX: 0.84, minY: 0.40, maxY: 0.72 }
  ];
  const zone = random(zones);
  const rocketColor = random(palette);
  fireworkRockets.push({
    x: random(width * zone.minX, width * zone.maxX),
    y: height + random(8, 42),
    targetY: random(height * zone.minY, height * zone.maxY),
    speed: random(max(4, height * 0.010), max(7, height * 0.019)),
    color: rocketColor,
    trail: [],
    initialBurst
  });
}

// 更新大型煙火、火箭拖尾與多色星芒，讓爆炸在全畫布錯開持續出現。
function updateAndDrawFireworks() {
  const now = millis();
  const activeEffects = fireworkRockets.length + fireworkBursts.length;
  if (now - lastFireworkSpawnTime > 260 || activeEffects < 5) {
    spawnFireworkRocket(false);
    if (random() < 0.30) {
      spawnFireworkRocket(false);
    }
    lastFireworkSpawnTime = now;
  }

  push();
  blendMode(ADD);
  noStroke();

  // 火箭上升時保留多段發光拖尾，增加速度感與慶祝氛圍。
  for (let i = fireworkRockets.length - 1; i >= 0; i -= 1) {
    const rocket = fireworkRockets[i];
    rocket.trail.push({ x: rocket.x, y: rocket.y, life: 1 });
    if (rocket.trail.length > 13) {
      rocket.trail.shift();
    }
    rocket.y -= rocket.speed;

    for (let trailIndex = 0; trailIndex < rocket.trail.length; trailIndex += 1) {
      const trail = rocket.trail[trailIndex];
      const trailAlpha = map(trailIndex, 0, rocket.trail.length, 25, 170);
      fill(255, 235, 150, trailAlpha);
      circle(trail.x, trail.y, max(2, width * 0.005 * (trailIndex + 1) / rocket.trail.length));
    }
    fill(255, 255, 220, 255);
    circle(rocket.x, rocket.y, max(4, width * 0.009));
    fill(255, 180, 70, 90);
    circle(rocket.x, rocket.y, max(10, width * 0.022));

    if (rocket.y <= rocket.targetY) {
      createFireworkBurst(rocket.x, rocket.y, rocket.color);
      fireworkRockets.splice(i, 1);
    }
  }

  // 繪製爆炸粒子、光暈與星芒；透明度會隨生命週期降低。
  for (let i = fireworkBursts.length - 1; i >= 0; i -= 1) {
    const burst = fireworkBursts[i];
    let livingParticles = 0;
    const fadeProgress = constrain(burst.age / burst.maxAge, 0, 1);
    const glowAlpha = 80 * (1 - fadeProgress);
    fill(red(burst.color), green(burst.color), blue(burst.color), glowAlpha);
    circle(burst.x, burst.y, burst.radius * (0.55 + fadeProgress * 0.85));

    for (const particle of burst.particles) {
      if (particle.life <= 0) {
        continue;
      }
      livingParticles += 1;
      particle.vy += particle.gravity;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.988;
      particle.vy *= 0.992;
      particle.life -= 1;
      const lifeRatio = constrain(particle.life / particle.maxLife, 0, 1);
      const alpha = 255 * lifeRatio;
      const size = particle.size * (0.70 + lifeRatio * 0.95);
      fill(red(particle.color), green(particle.color), blue(particle.color), alpha);
      circle(particle.x, particle.y, size);

      // 每隔幾個粒子加上四向星芒，讓大型煙火更明亮但不覆蓋文字區。
      if (particle.spark && lifeRatio > 0.18) {
        stroke(red(particle.color), green(particle.color), blue(particle.color), alpha * 0.60);
        strokeWeight(max(1, size * 0.16));
        line(particle.x - size * 1.7, particle.y, particle.x + size * 1.7, particle.y);
        line(particle.x, particle.y - size * 1.7, particle.x, particle.y + size * 1.7);
        noStroke();
      }
    }

    burst.age += 1;
    if (livingParticles === 0 || burst.age > burst.maxAge) {
      fireworkBursts.splice(i, 1);
    }
  }
  pop();
}

// 從爆炸中心建立更大半徑、更多粒子、較大尺寸與高亮度的彩色煙火。
function createFireworkBurst(centerX, centerY, burstColor) {
  const particles = [];
  const particleCount = floor(random(105, 155));
  const baseColor = color(burstColor);
  const secondaryPalette = ['#ff1744', '#ff6d00', '#ffd600', '#00e676', '#00b0ff', '#7c4dff', '#ff4081'];
  const baseSpeed = max(3.2, min(width, height) * 0.0105);
  const maxLife = random(82, 120);
  const radius = random(min(width, height) * 0.13, min(width, height) * 0.24);

  // 主放射層：粒子沿圓周向外飛散，保留重力與拖尾般的衰減感。
  for (let i = 0; i < particleCount; i += 1) {
    const angle = (TWO_PI * i) / particleCount + random(-0.045, 0.045);
    const speed = random(baseSpeed * 0.62, baseSpeed * 1.38);
    const particleColor = i % 5 === 0 ? color(random(secondaryPalette)) : baseColor;
    particles.push({
      x: centerX,
      y: centerY,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      gravity: max(0.035, height * 0.000085),
      life: random(maxLife * 0.72, maxLife),
      maxLife,
      size: random(max(3, min(width, height) * 0.006), max(6, min(width, height) * 0.014)),
      color: particleColor,
      spark: i % 4 === 0
    });
  }

  // 外圈少量長射線，拉大煙火爆炸範圍與層次。
  for (let i = 0; i < 22; i += 1) {
    const angle = (TWO_PI * i) / 22 + random(-0.06, 0.06);
    const speed = random(baseSpeed * 1.32, baseSpeed * 1.72);
    particles.push({
      x: centerX,
      y: centerY,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      gravity: max(0.045, height * 0.00010),
      life: random(maxLife * 0.60, maxLife * 0.86),
      maxLife,
      size: random(max(4, min(width, height) * 0.009), max(7, min(width, height) * 0.017)),
      color: color(random(secondaryPalette)),
      spark: true
    });
  }

  fireworkBursts.push({
    x: centerX,
    y: centerY,
    color: baseColor,
    radius,
    age: 0,
    maxAge: maxLife + 8,
    particles
  });
}

// 建立只使用紅色系的大型上升愛心，搭配紅色系星星與光圈。
function createEncouragementParticle(initialPosition) {
  const heartPalette = ['#ff1744', '#e53935', '#ff5252', '#ff8a80'];
  const sparklePalette = ['#ff1744', '#e53935', '#ff5252', '#ff8a80'];
  const shortSide = min(width, height);
  const heartSize = random(max(26, shortSide * 0.040), max(42, shortSide * 0.078));
  const isHeart = random() < 0.76;
  return {
    x: random(width * 0.07, width * 0.93),
    baseX: random(width * 0.07, width * 0.93),
    y: initialPosition ? random(height * 0.18, height * 1.08) : height + random(15, 55),
    speed: random(max(0.8, height * 0.0013), max(1.8, height * 0.0033)),
    size: isHeart ? heartSize : random(max(14, shortSide * 0.022), max(24, shortSide * 0.040)),
    rotation: random(-0.18, 0.18),
    rotationSpeed: random(-0.012, 0.012),
    phase: random(TWO_PI),
    sway: random(shortSide * 0.012, shortSide * 0.035),
    color: random(isHeart ? heartPalette : sparklePalette),
    type: isHeart ? 'heart' : 'star'
  };
}

// 更新愛心、星星與光圈；愛心會左右輕擺、淡出並從畫面下方持續循環。
function updateAndDrawEncouragement() {
  push();
  blendMode(ADD);
  noStroke();

  for (const particle of encouragementParticles) {
    particle.y -= particle.speed;
    particle.rotation += particle.rotationSpeed;
    const swayX = sin(frameCount * 0.026 + particle.phase) * particle.sway;
    const twinkle = 0.55 + 0.45 * sin(frameCount * 0.10 + particle.phase);
    const fadeIn = constrain((height - particle.y) / (height * 0.12), 0, 1);
    const fadeOut = constrain((particle.y + particle.size * 2) / (height * 0.18), 0, 1);
    const alpha = 235 * twinkle * min(fadeIn, fadeOut);
    const particleColor = color(particle.color);

    fill(red(particleColor), green(particleColor), blue(particleColor), alpha * 0.34);
    circle(particle.x + swayX, particle.y, particle.size * 2.1);
    fill(red(particleColor), green(particleColor), blue(particleColor), alpha);

    push();
    translate(particle.x + swayX, particle.y);
    rotate(particle.rotation + sin(frameCount * 0.02 + particle.phase) * 0.08);
    if (particle.type === 'star') {
      drawStar(0, 0, particle.size * 0.34, particle.size * 0.82, 5);
    } else {
      drawHeart(0, 0, particle.size * 0.72);
    }
    pop();

    noFill();
    stroke(red(particleColor), green(particleColor), blue(particleColor), alpha * 0.30);
    strokeWeight(max(1, particle.size * 0.07));
    circle(particle.x + swayX, particle.y, particle.size * (1.65 + twinkle * 0.45));
    noStroke();

    if (particle.y < -particle.size * 2) {
      Object.assign(particle, createEncouragementParticle(false));
    }
  }
  pop();
}

// 使用 Canvas 路徑繪製五角星，不建立任何 HTML 元素。
function drawStar(centerX, centerY, innerRadius, outerRadius, points) {
  beginShape();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -HALF_PI + (i * PI) / points;
    vertex(centerX + cos(angle) * radius, centerY + sin(angle) * radius);
  }
  endShape(CLOSE);
}

// 使用 Canvas 貝茲曲線繪製上升愛心。
function drawHeart(centerX, centerY, size) {
  beginShape();
  vertex(centerX, centerY + size * 0.85);
  bezierVertex(
    centerX - size * 1.25, centerY + size * 0.08,
    centerX - size * 0.82, centerY - size * 0.90,
    centerX - size * 0.35, centerY - size * 0.48
  );
  bezierVertex(
    centerX - size * 0.10, centerY - size * 0.98,
    centerX + size * 0.10, centerY - size * 0.98,
    centerX + size * 0.35, centerY - size * 0.48
  );
  bezierVertex(
    centerX + size * 0.82, centerY - size * 0.90,
    centerX + size * 1.25, centerY + size * 0.08,
    centerX, centerY + size * 0.85
  );
  endShape(CLOSE);
}

// ==================== 版面矩形與文字工具 ====================
// 繪製低分頁的同步鼓勵文字群組；兩句文字共用同一組位置、旋轉與縮放動畫。
function drawAnimatedEncouragementGroup(
  firstLine,
  secondLine,
  centerX,
  firstLineY,
  secondLineY,
  maxWidth,
  maxHeight,
  preferredSize,
  textColor
) {
  push();
  // 低分兩句英文鼓勵文字共用 Patrick Hand，確保同步動畫時字型一致。
  setEnglishFont(BOLD);
  textAlign(CENTER, CENTER);

  const safeWidth = max(1, maxWidth);
  const groupCenterY = (firstLineY + secondLineY) / 2;
  const lineOffset = (secondLineY - firstLineY) / 2;
  const requestedSway = min(width * 0.055, 48, safeWidth * 0.055);
  const topLimit = max(6, layout.result.messageY + layout.result.messageSize * 0.78);
  const bottomLimit = min(
    height - 6,
    layout.result.button.y - layout.result.button.h / 2 - 6
  );
  const verticalRoom = max(1, min(groupCenterY - topLimit, bottomLimit - groupCenterY));
  const usableHeight = max(1, maxHeight);

  // 先用建議字體量測兩行，確保最長的一行也能在放大時留有左右安全邊界。
  let fontSize = max(6, preferredSize);
  setEnglishFont(BOLD);
  textSize(fontSize);
  setEnglishFont(BOLD);
  let firstWidth = max(1, textWidth(firstLine));
  setEnglishFont(BOLD);
  let secondWidth = max(1, textWidth(secondLine));
  let widestWidth = max(firstWidth, secondWidth);
  const rotationWidthAllowance = 1.08;
  const widthForText = max(1, (safeWidth - requestedSway * 2) / rotationWidthAllowance);
  if (widestWidth > widthForText) {
    fontSize *= widthForText / widestWidth;
    fontSize = max(6, fontSize);
    setEnglishFont(BOLD);
    textSize(fontSize);
    setEnglishFont(BOLD);
    firstWidth = max(1, textWidth(firstLine));
    setEnglishFont(BOLD);
    secondWidth = max(1, textWidth(secondLine));
    widestWidth = max(firstWidth, secondWidth);
  }

  // 極窄或極短畫布時，先縮小正常字體，讓動畫仍能避開上方訊息與下方按鈕。
  const normalHalfHeight = abs(lineOffset) + fontSize * 0.72;
  const heightFromArgument = max(1, usableHeight * 0.48);
  const allowedNormalHalfHeight = min(verticalRoom, heightFromArgument);
  if (normalHalfHeight > allowedNormalHalfHeight && abs(lineOffset) < allowedNormalHalfHeight) {
    fontSize = max(6, (allowedNormalHalfHeight - abs(lineOffset)) / 0.72);
    setEnglishFont(BOLD);
    textSize(fontSize);
    setEnglishFont(BOLD);
    firstWidth = max(1, textWidth(firstLine));
    setEnglishFont(BOLD);
    secondWidth = max(1, textWidth(secondLine));
    widestWidth = max(firstWidth, secondWidth);
  }

  // 最大縮放比例依寬度、高度與安全邊界動態限制；一般畫面可誇張放大至約 1.7 倍。
  const normalHalfHeightAfterFit = abs(lineOffset) + fontSize * 0.72;
  const maxScaleByWidth = widthForText / max(1, widestWidth);
  const maxScaleByHeight = verticalRoom / max(1, normalHalfHeightAfterFit);
  const maximumScale = max(1.02, min(1.72, maxScaleByWidth, maxScaleByHeight));

  // 同一個 millis() 進度同時控制兩行，從正常大小放大到峰值，再縮回正常大小並循環。
  const elapsed = millis();
  const cycleProgress = (elapsed % 5200) / 5200;
  const pulse = 0.5 - 0.5 * cos(TWO_PI * cycleProgress);
  const groupScale = 1 + (maximumScale - 1) * pulse;
  const swayRange = min(
    requestedSway,
    max(0, (safeWidth - widestWidth * groupScale * rotationWidthAllowance) / 2)
  );
  const groupSway = swayRange * sin(TWO_PI * elapsed / 2600);
  const groupRotation = 0.065 * sin(TWO_PI * elapsed / 3100);

  // 以兩行文字群組的中心為 transform 原點，因此放大、旋轉和左右移動都保持整體置中。
  translate(centerX + groupSway, groupCenterY);
  rotate(groupRotation);
  scale(groupScale);
  fill(textColor);
  setEnglishFont(BOLD);
  textSize(fontSize);
  setEnglishFont(BOLD);
  text(firstLine, 0, -lineOffset);
  setEnglishFont(BOLD);
  text(secondLine, 0, lineOffset);
  pop();
  textStyle(NORMAL);
}

// 取得目前畫面的開始測驗按鈕矩形。
function getStartButtonRect() {
  return layout.start.button;
}

// 取得作答頁的下一題或查看成績按鈕矩形。
function getNextButtonRect() {
  return layout.quiz.nextButton;
}

// 取得成績頁的再測一次按鈕矩形。
function getRestartButtonRect() {
  return layout.result.button;
}

// 取得四個選項的基準矩形；動畫中的實際繪製矩形由 getDisplayedOptionRect 補上位移。
function getOptionRects() {
  return layout.quiz.optionRects;
}

// 將動畫位移套到選項矩形，保證需要時可使用與畫面完全相同的區域。
function getDisplayedOptionRect(optionIndex, offsetX, offsetY) {
  const baseRect = layout.quiz.optionRects[optionIndex];
  return {
    x: baseRect.x + (offsetX || 0),
    y: baseRect.y + (offsetY || 0),
    w: baseRect.w,
    h: baseRect.h
  };
}

// 判斷輸入點是否位於以中心座標表示的矩形內。
function isPointInsideRect(pointX, pointY, targetRect) {
  return (
    pointX >= targetRect.x - targetRect.w / 2 &&
    pointX <= targetRect.x + targetRect.w / 2 &&
    pointY >= targetRect.y - targetRect.h / 2 &&
    pointY <= targetRect.y + targetRect.h / 2
  );
}

// 讓答題回饋動畫在指定時間內逐漸淡出，避免永久干擾文字閱讀。
function getAnimationAmount(elapsed) {
  if (elapsed >= ANIMATION_DURATION) {
    return 0;
  }
  return 1 - elapsed / ANIMATION_DURATION;
}

// 將文字依最大寬度切成多行，支援中文、英文單字和混合內容。
function wrapTextByWidth(value, maxWidth, fontKind = 'chinese', weight = NORMAL) {
  setRequestedFontForCanvas(fontKind, weight);
  const characters = Array.from(String(value));
  const lines = [];
  let currentLine = '';

  for (const character of characters) {
    const candidate = currentLine + character;
    setRequestedFontForCanvas(fontKind, weight);
    if (currentLine.length > 0 && textWidth(candidate) > maxWidth) {
      lines.push(currentLine);
      currentLine = character;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

// 自動縮小字體並置中繪製多行文字；每次測量與繪製前都重新指定 family。
function drawFittedText(
  value,
  centerX,
  centerY,
  maxWidth,
  maxHeight,
  maxSize,
  minSize,
  fontKind = 'chinese',
  weight = BOLD
) {
  const safeWidth = max(1, maxWidth);
  const safeHeight = max(1, maxHeight);
  const preferredMinSize = max(6, minSize);
  let fontSize = max(6, maxSize);
  let lines = [];

  // 先從建議大小逐步縮小，直到寬度與高度都能容納所有文字。
  while (fontSize > preferredMinSize) {
    setRequestedFontForCanvas(fontKind, weight);
    textSize(fontSize);
    lines = wrapTextByWidth(value, safeWidth, fontKind, weight);
    if (lines.length * fontSize * 1.2 <= safeHeight) {
      break;
    }
    fontSize -= 1;
  }

  // 若極短螢幕仍不足，繼續縮到實際可容納的大小，不裁切文字。
  while (fontSize > 6) {
    setRequestedFontForCanvas(fontKind, weight);
    textSize(fontSize);
    lines = wrapTextByWidth(value, safeWidth, fontKind, weight);
    if (lines.length * fontSize * 1.2 <= safeHeight) {
      break;
    }
    fontSize -= 1;
  }

  setRequestedFontForCanvas(fontKind, weight);
  textSize(fontSize);
  lines = wrapTextByWidth(value, safeWidth, fontKind, weight);
  const lineHeight = fontSize * 1.2;
  const firstLineY = centerY - ((lines.length - 1) * lineHeight) / 2;

  for (let i = 0; i < lines.length; i += 1) {
    setRequestedFontForCanvas(fontKind, weight);
    textSize(fontSize);
    text(lines[i], centerX, firstLineY + i * lineHeight);
  }
}
