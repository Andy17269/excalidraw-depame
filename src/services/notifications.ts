export async function notify(body: string): Promise<void> {
  try {
    if (typeof Notification === 'undefined') return;
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission === 'granted') new Notification('Excalidraw', { body, tag: 'excalidraw' });
  } catch { /* Notifications are unavailable in Windows standalone mode. */ }
}
