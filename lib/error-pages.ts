import { THEME_INITIALIZER } from './theme-script'

const errorPages = {
  403: { label: 'ACCESS RESTRICTED', title: '접근할 수 없는 페이지입니다.', description: '이 페이지를 볼 수 있는 권한이 없습니다. 접근 권한이 필요하다면 관리자에게 문의해 주세요.' },
  404: { label: 'PAGE NOT FOUND', title: '페이지를 찾을 수 없습니다.', description: '주소가 변경되었거나 페이지가 존재하지 않습니다. 주소를 확인하거나 홈에서 다시 찾아보세요.' },
  429: { label: 'PLEASE SLOW DOWN', title: '잠시 쉬었다가 다시 시도해 주세요.', description: '짧은 시간에 요청이 많이 전달되었습니다. 잠시 후 다시 이용해 주세요.' },
  500: { label: 'SOMETHING WENT WRONG', title: '잠시 문제가 발생했습니다.', description: '요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
  503: { label: 'TEMPORARILY UNAVAILABLE', title: '잠시 서비스를 이용할 수 없습니다.', description: '서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 방문해 주세요.' },
} as const
export type ErrorCode = keyof typeof errorPages

// Only compile-time constants are used here; no URL, exception or user content is interpolated.
export function errorMarkup(code: ErrorCode) {
  const page = errorPages[code]
  return `<div class="error-top"><a href="/" class="error-brand" aria-label="RANI 홈">RANI<span>PORTFOLIO</span></a><span class="error-status">요청을 완료하지 못했습니다</span></div><main class="error-main"><div class="error-code" aria-hidden="true">${code}<span class="error-orbit"></span></div><div class="error-copy"><span class="error-label"><span></span>${page.label}</span><h1>${page.title}</h1><p>${page.description}</p><div class="error-actions"><a class="error-primary" href="/">홈으로 돌아가기 <span aria-hidden="true">↗</span></a><a class="error-secondary" href="/#projects">프로젝트 둘러보기</a></div><div class="error-reference">ERROR ${code}<span aria-hidden="true"> / </span>RANI WEB</div></div></main><footer class="error-footer"><span>좋은 경험을 만드는 개발자, RANI</span><a href="mailto:support@raniweb.kr">문의하기 ↗</a></footer>`
}

function errorDocument(code: ErrorCode, nonce?: string) {
  const themeScript = nonce && /^[A-Za-z0-9+/=]{16,80}$/.test(nonce) ? `<script nonce="${nonce}">${THEME_INITIALIZER}</script>` : ''
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${code} | RANI</title><link rel="icon" href="/logo.webp"><link rel="stylesheet" href="/errors.css">${themeScript}</head><body class="error-document"><div class="error-page">${errorMarkup(code)}</div></body></html>`
}

export function errorResponse(code: ErrorCode, nonce?: string) {
  return new Response(errorDocument(code, nonce), {
    status: code,
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...([429, 503].includes(code) ? { 'Retry-After': '60' } : {}),
    },
  })
}
