# RaniWeb

프로젝트와 개발 경험을 소개하기 위해 만든 RANI의 개인 포트폴리오 웹사이트입니다. 프로젝트별로 어떤 문제를 풀었는지, 어떤 기술을 사용했는지, 어떻게 구현했는지 정리했습니다.

**웹사이트** · [www.raniweb.kr](https://www.raniweb.kr)

## 사용한 언어와 기술

| 구분 | 기술 | 사용한 곳 |
| --- | --- | --- |
| 웹 애플리케이션 | TypeScript, TSX, React 19, Next.js 16 App Router | 페이지, UI 컴포넌트, 서버 라우트 |
| 스타일 | CSS, CSS Modules | 반응형 레이아웃, 라이트·다크 테마 |
| 콘텐츠 | Markdown, JSON | 프로젝트 상세 문서, 기술 스택, 경력, 자격증, 수상 이력 |
| 검증 | ESLint, Node.js 테스트 러너, Playwright | 코드 검사, 단위 테스트, Chromium·WebKit 브라우저 테스트 |
| 빌드·배포 | Node.js 26, Docker, GitHub Actions, Python | 운영용 이미지 빌드, CI, 배포 도구 |

## 주요 기능

- 프로젝트 목록에서 상세 내용을 모달로 확인하거나, 개별 프로젝트 URL로 공유할 수 있습니다.
- 경력, 기술 스택, 자격증, 수상 내역을 한 페이지에서 볼 수 있습니다.
- 시스템 설정을 따르는 라이트·다크 테마와 모바일 화면을 지원합니다.
- 프로젝트 이미지는 WebP로 제공하며, Markdown에 포함된 링크와 이미지 주소를 검증합니다.

## 로컬에서 실행

Node.js 26.13.0과 npm이 필요합니다. nvm을 사용한다면 프로젝트 폴더에서 `nvm install`과 `nvm use`를 실행하면 됩니다.

```bash
git clone https://github.com/rani0707/Raniweb.git
cd Raniweb
npm ci --ignore-scripts
npm run dev
```

브라우저에서 [localhost:3000](http://localhost:3000)을 열면 됩니다.

```bash
npm run check
npm run build
```

## 프로젝트 구조

| 경로 | 내용 |
| --- | --- |
| `app/` | 페이지, 사이트맵, API 라우트 |
| `components/` | 화면 컴포넌트와 CSS Modules |
| `data/` | 프로젝트 및 프로필 데이터 |
| `public/content/projects/` | 프로젝트 상세 Markdown |
| `tests/` | 단위 테스트와 브라우저 테스트 |

## 라이선스

[MIT License](LICENSE)

## Cloudflare Tunnel이 있는 Ubuntu에 배포

기존 `cloudflared`가 시스템 Docker의 `cloudflare-net`을 쓰는 서버에서는 RaniWeb도 같은 네트워크에 연결할 수 있습니다. 예시는 `ubuntu` 계정과 `/home/ubuntu/RaniWeb` 체크아웃을 사용합니다. 이 서비스는 Docker 소켓에 접근할 수 있으므로 배포할 `main`의 쓰기 권한은 신뢰하는 계정에만 부여하세요.

```bash
cd ~/RaniWeb
git pull --ff-only origin main
sudo install -m 0644 deployment/systemd/raniweb-cloudflare-deploy.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start raniweb-cloudflare-deploy.service
sudo journalctl -u raniweb-cloudflare-deploy.service -n 40 --no-pager
```

첫 배포가 끝나면 같은 Docker 네트워크에서 컨테이너 이름으로 접속되는지 확인합니다.

```bash
sudo docker run --rm --network cloudflare-net --entrypoint node \
  "raniweb:$(git rev-parse HEAD)" -e '
    fetch("http://raniweb-web:18081/api/health", {signal: AbortSignal.timeout(5000)})
      .then(async response => { if (!response.ok) throw Error(response.status); console.log(await response.text()) })
      .catch(error => { console.error(error); process.exitCode = 1 })
  '
```

`{"status":"ok"}`가 나오면 기존 터널의 2번 `raniweb.kr` 서비스 URL을 `http://raniweb-web:18081`로 지정합니다. 1번 `lac.raniweb.kr`은 기존 주소를 사용합니다. RaniWeb은 호스트에 포트를 공개하지 않습니다.

```bash
curl -fsS https://raniweb.kr/api/health &&
  sudo systemctl enable --now raniweb-cloudflare-deploy.timer
```

이전 사용자 타이머를 사용하던 서버라면 새 경로의 응답을 확인한 뒤 `systemctl --user disable --now raniweb-local-deploy.timer`로 전환을 마칩니다. 이전에 `raniweb-tunnel-origin.service`를 설치했다면 새 경로 확인 후 `sudo systemctl disable --now raniweb-tunnel-origin.service`로 끌 수 있습니다.
