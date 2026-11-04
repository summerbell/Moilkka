/* Entry: ?p=<id> loads the board for that project, otherwise the project list. Each page module exposes
   init() (draw what it can right away), start(DB) (once storage is connected) and fail(msg). */
import { PID, $ } from './util.js';
import { configured, openDB } from './db.js';

(async () => {
  const page = await (PID ? import('./board/index.js') : import('./home.js'));
  page.init();
  if (!configured()) {
    const b = $('#banner');
    b.innerHTML = '<b>혼자 써보기 모드</b> · Firebase가 아직 연결되지 않아 이 브라우저에만 저장돼요. README의 Firebase 설정을 마치면 링크를 받은 사람들과 함께 쓸 수 있어요.';
    b.hidden = false;
  }
  let DB;
  try { DB = await openDB(); }
  catch (e) { page.fail('Firebase에 연결할 수 없어요. config.js의 설정값과 인터넷 연결을 확인하세요.'); return; }
  page.start(DB);
})();
