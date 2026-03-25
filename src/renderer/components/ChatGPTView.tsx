import React, { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useColors } from '../theme'

// Module-level pending message — set by App before ChatGPTView mounts
let _pendingMessage = ''
export function queueChatGPTMessage(msg: string) { _pendingMessage = msg }

// CSS injected into chat.openai.com — matches Clui CC dark warm palette
const INJECTED_CSS = `
/* ─── Hide chrome: sidebar, header, branding, disclaimer ─── */
nav[aria-label], [data-testid*="sidebar"] { display: none !important; }
header, header#page-header { display: none !important; }
[data-testid="welcome-thread"] { display: none !important; }
.text-center.text-xs.text-token-text-secondary { display: none !important; }
#onetrust-banner-sdk, #onetrust-consent-sdk { display: none !important; }

/* ─── Hide native input visually but keep it focusable for injection ─── */
#thread-bottom-container { position: fixed !important; top: -9999px !important; left: -9999px !important; pointer-events: none !important; }

/* ─── Base: Clui CC dark background ─── */
html, body { background: #242422 !important; margin: 0 !important; padding: 0 !important; color: #ccc9c0 !important; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif !important; font-size: 13px !important; }
main, [role="main"], .h-full { background: #242422 !important; }

/* ─── Override ChatGPT CSS tokens ─── */
:root {
  --text-primary: #ccc9c0 !important;
  --text-secondary: #c0bdb2 !important;
  --text-tertiary: #76766e !important;
  --surface-primary: #242422 !important;
  --surface-secondary: #353530 !important;
  --surface-tertiary: #2a2a27 !important;
  --border-light: #3b3b36 !important;
  --border-medium: #3b3b36 !important;
  --border-heavy: #3b3b36 !important;
}

/* ─── All text → warm off-white ─── */
p, li, h1, h2, h3, h4, span, div, label { color: #ccc9c0 !important; }
[class*="text-token-text-primary"] { color: #ccc9c0 !important; }
[class*="text-token-text-secondary"] { color: #76766e !important; }

/* ─── User message bubbles ─── */
[data-message-author-role="user"] > div > div {
  background: #353530 !important;
  border-radius: 16px !important;
  border: 1px solid #4a4a45 !important;
  color: #ccc9c0 !important;
}

/* ─── Assistant messages ─── */
[data-message-author-role="assistant"] { background: transparent !important; color: #ccc9c0 !important; }

/* ─── Code blocks ─── */
pre, code { background: #1a1a18 !important; border: 1px solid #3b3b36 !important; border-radius: 8px !important; color: #ccc9c0 !important; font-family: 'SF Mono', 'Fira Code', monospace !important; font-size: 12px !important; }

/* ─── Links ─── */
a { color: #10a37f !important; }

/* ─── Hide generation / thinking indicator & dividers ─── */
input[type="range"], hr,
[role="progressbar"], [data-testid*="streaming"], [data-testid*="thinking"],
[class*="StreamingIndicator"], [class*="thinking-indicator"],
[class*="generatingIndicator"] { display: none !important; }

/* ─── Scrollbar ─── */
::-webkit-scrollbar { width: 4px !important; }
::-webkit-scrollbar-track { background: transparent !important; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15) !important; border-radius: 4px !important; }
`

async function injectMessage(wv: Electron.WebviewTag, msg: string) {
  try {
    await wv.executeJavaScript(`
      (function tryInject(retries) {
        var editor = document.getElementById('prompt-textarea');
        if (!editor) {
          if (retries > 0) setTimeout(function() { tryInject(retries - 1); }, 300);
          return;
        }
        /* Temporarily make the native input container fully interactive */
        var container = document.getElementById('thread-bottom-container');
        if (container) {
          container.style.setProperty('position', 'static', 'important');
          container.style.setProperty('top', 'auto', 'important');
          container.style.setProperty('left', 'auto', 'important');
          container.style.setProperty('pointer-events', 'auto', 'important');
        }
        editor.focus();
        document.execCommand('insertText', false, ${JSON.stringify(msg)});
        setTimeout(function() {
          var btn = document.querySelector('button[data-testid="send-button"]') || document.getElementById('composer-submit-button');
          if (btn && !btn.disabled) btn.click();
          /* Re-hide the container after clicking send */
          setTimeout(function() {
            if (container) {
              container.style.setProperty('position', 'fixed', 'important');
              container.style.setProperty('top', '-9999px', 'important');
              container.style.setProperty('left', '-9999px', 'important');
              container.style.setProperty('pointer-events', 'none', 'important');
            }
          }, 300);
        }, 200);
      })(25);
    `)
  } catch {}
}

export function ChatGPTView({ height }: { height: number }) {
  const webviewRef = useRef<Electron.WebviewTag>(null)
  const [loading, setLoading] = useState(true)
  const colors = useColors()

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    let hideTimer: ReturnType<typeof setTimeout> | null = null

    const hideShimmer = async () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
      try { await wv.insertCSS(INJECTED_CSS) } catch {}
      // Inject MutationObserver to detect when user sends a message
      try {
        await wv.executeJavaScript(`
          (function() {
            if (window.__cluiObserver) return;
            window.__cluiObserver = new MutationObserver(function() {
              if (document.querySelector('[data-message-author-role="user"]')) {
                console.log('__clui_user_msg__');
              }
            });
            window.__cluiObserver.observe(document.body, { childList: true, subtree: true });
          })();
        `)
      } catch {}
      setLoading(false)
      // Send any message that was queued before the webview loaded
      if (_pendingMessage) {
        const msg = _pendingMessage
        _pendingMessage = ''
        await injectMessage(wv, msg)
      }
    }

    const onConsole = (e: any) => {
      if ((e.message || '').includes('__clui_user_msg__')) {
        window.dispatchEvent(new CustomEvent('clui-chatgpt-message-sent'))
      }
    }

    const onStartLoad = () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
      setLoading(true)
      hideTimer = setTimeout(hideShimmer, 6000)
    }

    const onNewWindow = (e: any) => {
      const url: string = e.url || e.detail?.url
      if (url) wv.loadURL(url)
    }

    const onNewChat = () => {
      _pendingMessage = ''
      wv.loadURL('https://chat.openai.com')
    }

    const onScreenshot = async () => {
      const result = await window.clui.takeScreenshot()
      if (!result?.dataUrl) return
      try {
        const res = await fetch(result.dataUrl)
        const blob = await res.blob()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        // Temporarily show native input so editor can accept paste
        await wv.executeJavaScript(`
          (function() {
            var c = document.getElementById('thread-bottom-container');
            if (c) { c.style.setProperty('position','static','important'); c.style.setProperty('pointer-events','auto','important'); }
            var e = document.getElementById('prompt-textarea');
            if (e) e.focus();
          })();
        `)
        wv.paste()
        // Click send after a short delay, then re-hide the container
        setTimeout(async () => {
          try {
            await wv.executeJavaScript(`
              (function() {
                setTimeout(function() {
                  var btn = document.querySelector('button[data-testid="send-button"]') || document.getElementById('composer-submit-button');
                  if (btn && !btn.disabled) btn.click();
                }, 300);
                setTimeout(function() {
                  var c = document.getElementById('thread-bottom-container');
                  if (c) { c.style.setProperty('position','fixed','important'); c.style.setProperty('top','-9999px','important'); c.style.setProperty('pointer-events','none','important'); }
                }, 800);
              })();
            `)
          } catch {}
        }, 500)
      } catch {}
    }

    const onSend = async (e: Event) => {
      const msg = (e as CustomEvent).detail as string
      if (msg) await injectMessage(wv, msg)
    }

    wv.addEventListener('did-finish-load', hideShimmer)
    wv.addEventListener('did-stop-loading', hideShimmer)
    wv.addEventListener('did-start-loading', onStartLoad)
    wv.addEventListener('new-window', onNewWindow)
    wv.addEventListener('console-message', onConsole)
    window.addEventListener('clui-new-chat', onNewChat)
    window.addEventListener('clui-screenshot-chatgpt', onScreenshot)
    window.addEventListener('clui-chatgpt-send', onSend)
    hideTimer = setTimeout(hideShimmer, 6000)

    return () => {
      if (hideTimer) clearTimeout(hideTimer)
      wv.removeEventListener('did-finish-load', hideShimmer)
      wv.removeEventListener('did-stop-loading', hideShimmer)
      wv.removeEventListener('did-start-loading', onStartLoad)
      wv.removeEventListener('new-window', onNewWindow)
      wv.removeEventListener('console-message', onConsole)
      window.removeEventListener('clui-new-chat', onNewChat)
      window.removeEventListener('clui-screenshot-chatgpt', onScreenshot)
      window.removeEventListener('clui-chatgpt-send', onSend)
    }
  }, [])

  return (
    <div
      data-clui-ui
      style={{
        position: 'relative',
        height,
        borderRadius: '0 0 20px 20px',
        overflow: 'hidden',
        background: colors.containerBg,
        transition: 'height 0.4s cubic-bezier(0.4, 0, 0.1, 1), background-color 0.32s cubic-bezier(0.4, 0, 0.1, 1)',
      }}
    >
      <webview
        ref={webviewRef}
        src="https://chat.openai.com"
        partition="persist:chatgpt"
        allowpopups="true"
        style={{ width: '100%', height: '100%', display: 'flex' }}
      />

      {/* Loading shimmer overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: colors.containerBg,
              padding: '20px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              pointerEvents: 'none',
            }}
          >
            {[0.9, 0.7, 0.5].map((w, i) => (
              <div
                key={i}
                style={{
                  height: 12,
                  borderRadius: 6,
                  background: colors.surfacePrimary,
                  width: `${w * 100}%`,
                  opacity: 0.6,
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
