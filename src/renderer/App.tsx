import React, { useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Paperclip, Camera, HeadCircuit, Plus } from '@phosphor-icons/react'
import { TabStrip } from './components/TabStrip'
import { ConversationView } from './components/ConversationView'
import { InputBar } from './components/InputBar'
import { StatusBar } from './components/StatusBar'
import { MarketplacePanel } from './components/MarketplacePanel'
import { PopoverLayerProvider } from './components/PopoverLayer'
import { SettingsPopover } from './components/SettingsPopover'
import { useClaudeEvents } from './hooks/useClaudeEvents'
import { useHealthReconciliation } from './hooks/useHealthReconciliation'
import { useSessionStore } from './stores/sessionStore'
import { useColors, useThemeStore, spacing } from './theme'
import { ChatGPTView, queueChatGPTMessage } from './components/ChatGPTView'

const TRANSITION = { duration: 0.26, ease: [0.4, 0, 0.1, 1] as const }
const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.8 }

export default function App() {
  useClaudeEvents()
  useHealthReconciliation()

  const activeTabStatus = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.status)
  const addAttachments = useSessionStore((s) => s.addAttachments)
  const colors = useColors()
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme)
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const provider = useThemeStore((s) => s.provider)

  // ChatGPT starts collapsed — expands only after user submits a message
  const [chatgptExpanded, setChatgptExpanded] = useState(false)
  const [chatgptHasMessages, setChatgptHasMessages] = useState(false)
  const [chatgptInput, setChatgptInput] = useState('')
  useEffect(() => { setChatgptExpanded(false); setChatgptHasMessages(false); setChatgptInput(''); useThemeStore.getState().setChatgptViewExpanded(false) }, [provider])
  useEffect(() => {
    const onMsg = () => setChatgptHasMessages(true)
    window.addEventListener('clui-chatgpt-message-sent', onMsg)
    return () => window.removeEventListener('clui-chatgpt-message-sent', onMsg)
  }, [])

  // ─── Theme initialization ───
  useEffect(() => {
    // Get initial OS theme — setSystemTheme respects themeMode (system/light/dark)
    window.clui.getTheme().then(({ isDark }) => {
      setSystemTheme(isDark)
    }).catch(() => {})

    // Listen for OS theme changes
    const unsub = window.clui.onThemeChange((isDark) => {
      setSystemTheme(isDark)
    })
    return unsub
  }, [setSystemTheme])

  useEffect(() => {
    useSessionStore.getState().initStaticInfo().then(() => {
      const homeDir = useSessionStore.getState().staticInfo?.homePath || '~'
      const tab = useSessionStore.getState().tabs[0]
      if (tab) {
        // Set working directory to home by default (user hasn't chosen yet)
        useSessionStore.setState((s) => ({
          tabs: s.tabs.map((t, i) => (i === 0 ? { ...t, workingDirectory: homeDir, hasChosenDirectory: false } : t)),
        }))
        window.clui.createTab().then(({ tabId }) => {
          useSessionStore.setState((s) => ({
            tabs: s.tabs.map((t, i) => (i === 0 ? { ...t, id: tabId } : t)),
            activeTabId: tabId,
          }))
        }).catch(() => {})
      }
    })
  }, [])

  // OS-level click-through (RAF-throttled to avoid per-pixel IPC)
  useEffect(() => {
    if (!window.clui?.setIgnoreMouseEvents) return
    let lastIgnored: boolean | null = null

    const onMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const isUI = !!(el && el.closest('[data-clui-ui]'))
      const shouldIgnore = !isUI
      if (shouldIgnore !== lastIgnored) {
        lastIgnored = shouldIgnore
        if (shouldIgnore) {
          window.clui.setIgnoreMouseEvents(true, { forward: true })
        } else {
          window.clui.setIgnoreMouseEvents(false)
        }
      }
    }

    const onMouseLeave = () => {
      if (lastIgnored !== true) {
        lastIgnored = true
        window.clui.setIgnoreMouseEvents(true, { forward: true })
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  const isExpanded = useSessionStore((s) => s.isExpanded)
  const marketplaceOpen = useSessionStore((s) => s.marketplaceOpen)
  const isRunning = activeTabStatus === 'running' || activeTabStatus === 'connecting'

  // ChatGPT: expands only after the user clicks the pill. Claude: uses isExpanded from store.
  const showExpanded = isExpanded || (provider === 'chatgpt' && chatgptExpanded)

  // Layout dimensions — expandedUI widens and heightens the panel
  const contentWidth = expandedUI ? 700 : spacing.contentWidth
  // In ChatGPT mode (expanded): fill the full content column width and maximise height
  const cardExpandedWidth = (provider === 'chatgpt' && chatgptExpanded) ? contentWidth : (expandedUI ? 700 : 460)
  const cardCollapsedWidth = expandedUI ? 670 : 430
  const cardCollapsedMargin = expandedUI ? 15 : 15
  const bodyMaxHeight = provider === 'chatgpt'
    ? 360
    : (expandedUI ? 520 : 400)

  const handleScreenshot = useCallback(async () => {
    const result = await window.clui.takeScreenshot()
    if (!result) return
    addAttachments([result])
  }, [addAttachments])

  const handleAttachFile = useCallback(async () => {
    const files = await window.clui.attachFiles()
    if (!files || files.length === 0) return
    addAttachments(files)
  }, [addAttachments])

  return (
    <PopoverLayerProvider>
      <div className="flex flex-col justify-end h-full" style={{ background: 'transparent' }}>

        {/* ─── 460px content column, centered. Circles overflow left. ─── */}
        <div style={{ width: contentWidth, position: 'relative', margin: '0 auto', transition: 'width 0.26s cubic-bezier(0.4, 0, 0.1, 1)' }}>

          <AnimatePresence initial={false}>
            {marketplaceOpen && (
              <div
                data-clui-ui
                style={{
                  width: 720,
                  maxWidth: 720,
                  marginLeft: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 14,
                  position: 'relative',
                  zIndex: 30,
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.985 }}
                  transition={TRANSITION}
                >
                  <div
                    data-clui-ui
                    className="glass-surface overflow-hidden no-drag"
                    style={{
                      borderRadius: 24,
                      maxHeight: 470,
                    }}
                  >
                    <MarketplacePanel />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/*
            ─── Tabs / message shell ───
            This always remains the chat shell. The marketplace is a separate
            panel rendered above it, never inside it.
          */}
          <motion.div
            data-clui-ui
            className="overflow-hidden flex flex-col drag-region"
            animate={{
              width: showExpanded ? cardExpandedWidth : cardCollapsedWidth,
              marginBottom: showExpanded ? 10 : -14,
              marginLeft: showExpanded ? 0 : cardCollapsedMargin,
              marginRight: showExpanded ? 0 : cardCollapsedMargin,
              background: showExpanded ? colors.containerBg : colors.containerBgCollapsed,
              borderColor: colors.containerBorder,
              boxShadow: showExpanded ? colors.cardShadow : colors.cardShadowCollapsed,
            }}
            transition={SPRING}
            style={{
              borderWidth: 1,
              borderStyle: 'solid',
              borderRadius: 20,
              position: 'relative',
              zIndex: showExpanded ? 20 : 10,
            }}
          >
            {/* Tab strip — Claude only; ChatGPT gets a minimal settings-only header */}
            <div className="no-drag">
              {provider === 'chatgpt' ? (
                <div data-clui-ui className="flex items-center no-drag" style={{ padding: '8px 0' }}>
                  {/* Tab pill — mirrors Claude's active tab style */}
                  <div className="relative min-w-0 flex-1" style={{ paddingLeft: 8 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.tabActive, border: `1px solid ${colors.tabActiveBorder}`, borderRadius: 9999, padding: '4px 10px', fontSize: 12, color: colors.textPrimary, fontWeight: 500, userSelect: 'none' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10a37f', flexShrink: 0 }} />
                      <span>ChatGPT</span>
                    </div>
                  </div>
                  {/* Right actions: + and settings — mirrors TabStrip right side */}
                  <div className="flex items-center gap-0.5 flex-shrink-0 ml-1 pr-2">
                    <button
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
                      style={{ color: colors.textTertiary }}
                      title="New chat"
                      onClick={() => { window.dispatchEvent(new CustomEvent('clui-new-chat')); setChatgptHasMessages(false) }}
                    >
                      <Plus size={14} />
                    </button>
                    <SettingsPopover />
                  </div>
                </div>
              ) : (
                <TabStrip />
              )}
            </div>

            {/* Body — chat history only; the marketplace is a separate overlay above */}
            <motion.div
              initial={false}
              animate={{
                maxHeight: showExpanded ? bodyMaxHeight : 0,
                opacity: showExpanded ? 1 : 0,
              }}
              transition={SPRING}
              className="overflow-hidden no-drag"
            >
              <div>
                <AnimatePresence mode="wait">
                  {provider === 'chatgpt' ? (
                    chatgptExpanded ? (
                      <motion.div key="chatgpt"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.26 }}>
                        <ChatGPTView height={bodyMaxHeight} />
                      </motion.div>
                    ) : null
                  ) : (
                    <motion.div key="claude"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.26 }}>
                      <ConversationView />
                      <StatusBar />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>

          {/* ─── Input row — circles float outside left ─── */}
          {/* marginBottom: shadow buffer so the glass-surface drop shadow isn't clipped at the native window edge */}
          <motion.div key="input-row" data-clui-ui className="relative"
            style={{ minHeight: 46, zIndex: 15, marginBottom: 10 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={TRANSITION}>

            {provider === 'chatgpt' ? (
              <>
                {/* Camera circle — same position as Claude's circles */}
                <div data-clui-ui className="circles-out">
                  <div className="btn-stack" style={{ width: 46 }}>
                    <button
                      className="stack-btn stack-btn-1 glass-surface"
                      title="Take screenshot"
                      onClick={() => window.dispatchEvent(new CustomEvent('clui-screenshot-chatgpt'))}
                    >
                      <Camera size={17} />
                    </button>
                  </div>
                </div>

                {/* ChatGPT detached input pill */}
                <div
                  data-clui-ui
                  className="glass-surface w-full"
                  style={{ minHeight: 50, borderRadius: 25, padding: '0 16px', background: colors.inputPillBg, display: 'flex', alignItems: 'center' }}
                >
                  <textarea
                    value={chatgptInput}
                    onChange={(e) => setChatgptInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        const msg = chatgptInput.trim()
                        if (!msg) return
                        setChatgptInput('')
                        if (!chatgptExpanded) {
                          queueChatGPTMessage(msg)
                          setChatgptExpanded(true)
                          useThemeStore.getState().setChatgptViewExpanded(true)
                        } else {
                          window.dispatchEvent(new CustomEvent('clui-chatgpt-send', { detail: msg }))
                        }
                      }
                    }}
                    placeholder="Ask ChatGPT..."
                    rows={1}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      color: colors.textPrimary,
                      fontSize: 14,
                      fontFamily: 'inherit',
                      lineHeight: '1.5',
                      padding: '0',
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Stacked circle buttons — expand on hover */}
                <div data-clui-ui className="circles-out">
                  <div className="btn-stack">
                    {/* btn-1: Attach (front, rightmost) */}
                    <button
                      className="stack-btn stack-btn-1 glass-surface"
                      title="Attach file"
                      onClick={handleAttachFile}
                      disabled={isRunning}
                    >
                      <Paperclip size={17} />
                    </button>
                    {/* btn-2: Screenshot (middle) */}
                    <button
                      className="stack-btn stack-btn-2 glass-surface"
                      title="Take screenshot"
                      onClick={handleScreenshot}
                      disabled={isRunning}
                    >
                      <Camera size={17} />
                    </button>
                    {/* btn-3: Skills (back, leftmost) */}
                    <button
                      className="stack-btn stack-btn-3 glass-surface"
                      title="Skills & Plugins"
                      onClick={() => useSessionStore.getState().toggleMarketplace()}
                      disabled={isRunning}
                    >
                      <HeadCircuit size={17} />
                    </button>
                  </div>
                </div>

                {/* Input pill */}
                <div
                  data-clui-ui
                  className="glass-surface w-full"
                  style={{ minHeight: 50, borderRadius: 25, padding: '0 6px 0 16px', background: colors.inputPillBg }}
                >
                  <InputBar />
                </div>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </PopoverLayerProvider>
  )
}
