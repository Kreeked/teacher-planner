import { googleShowUrl, viewMode } from '../data/materials'
import { loadPdf } from '../lib/offlineFiles'
import { closeViewer, useViewed } from '../lib/viewer'
import { FileViewer } from './FileViewer'

/** Вбудований перегляд відкритого матеріалу; живе в AppLayout поруч з іншими вікнами. */
export function ViewerHost() {
  const m = useViewed()
  if (!m) return null
  return <FileViewer key={m.id} title={m.title} load={(fresh) => loadPdf(m, fresh)} google={googleShowUrl(m)} mode={viewMode(m)} onClose={closeViewer} />
}
