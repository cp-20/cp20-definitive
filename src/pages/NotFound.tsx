import { httpStatus } from '@solidjs/web';
import Icon from '../components/Icon';
export default function NotFound() {
  httpStatus(404);
  return (
    <div class="wrap not-found">
      <p class="eyebrow">404</p>
      <h1>ページが見つかりません。</h1>
      <a href="/" class="under-link">
        ホームへ戻る
        <Icon name="ArrowRight" size={18} />
      </a>
    </div>
  );
}
