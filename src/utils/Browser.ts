export type BrowserIssue = "brave" | "inapp" | "firefox" | null;

export function detectBrowserIssue(): BrowserIssue {
  const ua = navigator.userAgent;
  if ("brave" in navigator) {
    return "brave";
  }
  const uaData = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData;
  if (uaData?.brands?.some((brand) => /Brave/i.test(brand.brand))) {
    return "brave";
  }
  if (/Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|BytedanceWebview|Twitter|Snapchat|WhatsApp|Messenger|WeChat|MicroMessenger|Pinterest|LinkedInApp|GSA\//i.test(ua)) {
    return "inapp";
  }
  if (/Firefox|FxiOS/i.test(ua) && !/Chrome|CriOS/i.test(ua)) {
    return "firefox";
  }
  return null;
}

export function browserIssueMessage(issue: BrowserIssue): string {
  if (issue === "brave") {
    return "Este navegador (Brave) bloquea el sensor. Ábrelo en Chrome o Safari para inclinar el celular.";
  }
  if (issue === "inapp") {
    return "Entraste desde una app (Instagram, Facebook u otra). Ahí no se puede inclinar. Ábrelo en Chrome o Safari.";
  }
  if (issue === "firefox") {
    return "Firefox suele bloquear el sensor. Ábrelo en Chrome o Safari para volar inclinando.";
  }
  return "";
}
