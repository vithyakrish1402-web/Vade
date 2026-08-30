repo: vithyakrish1402-web/Vade
branch: main
path: client/src

## Last sync
date: 2026-08-28T09:12:00Z

### Updated in this project
- Full monochrome mobile redesign built as an interactive prototype: messages, search, chat, gesture reveal, contact security, devices, profile, welcome, gesture enrollment, login/register
- Added state coverage: empty list, offline/reconnecting, queued and failed sends, no search results, swipe row actions, long-press message sheet
- Desktop three-pane layout, design spec (tokens, type, motion, Android parity, accessibility), developer handoff (screen map, build order, acceptance criteria) and a 12-slide review deck
- Baseline recreation of the current web client kept for before/after comparison

## Screen map
| Project screen | Repo files |
| --- | --- |
| Vade.dc.html — Messages, Search | client/src/pages/DashboardPage.tsx, client/src/components/chat/ConversationList.tsx, client/src/components/chat/UserSearch.tsx |
| Vade.dc.html — Chat, reveal | client/src/pages/ConversationPage.tsx, client/src/components/chat/*, client/src/components/messages/ProtectedMessage.tsx, client/src/utils/protectedText/homoglyphRenderer.ts, client/src/components/gesture/GestureRevealModal.tsx |
| Vade.dc.html — Contact security, Devices | client/src/components/security/ContactSecurityModal.tsx, client/src/components/security/DeviceManagement.tsx |
| Vade.dc.html — Profile, protection style | client/src/pages/DashboardPage.tsx, client/src/components/messages/ProtectionStyleSettings.tsx |
| Vade.dc.html — Welcome, Enrollment, Login, Register | client/src/pages/LoginPage.tsx, client/src/pages/RegisterPage.tsx, client/src/components/gesture/GestureCanvas.tsx (enrollment flow is new) |
| Vade Desktop.dc.html | composite of the above at desktop width (new) |
| Vade Spec.dc.html, Vade Handoff.dc.html, Vade Review Deck.dc.html | documentation, no direct repo source |

## Baseline recreation
| Project screen | Repo files |
| --- | --- |
| Vade Current UI.dc.html — 1a Login | client/src/pages/LoginPage.tsx, client/src/components/Layout.tsx, client/src/components/Navbar.tsx, client/src/components/ui/Input.tsx, client/src/components/ui/Button.tsx |
| Vade Current UI.dc.html — 1b Dashboard / Chats | client/src/pages/DashboardPage.tsx, client/src/components/chat/ConversationList.tsx, client/src/utils/dateUtils.ts |
| Vade Current UI.dc.html — 1c Conversation | client/src/pages/ConversationPage.tsx, client/src/components/chat/ChatHeader.tsx, client/src/components/chat/MessageList.tsx, client/src/components/chat/MessageBubble.tsx, client/src/components/chat/MessageComposer.tsx, client/src/components/messages/ProtectedMessage.tsx, client/src/utils/protectedText/homoglyphRenderer.ts, client/src/components/ui/Badge.tsx |
| Vade Current UI.dc.html — 1d Modals | client/src/components/gesture/GestureRevealModal.tsx, client/src/components/security/ContactSecurityModal.tsx, client/src/components/security/DeviceManagement.tsx, client/src/components/messages/ProtectionStyleSettings.tsx |
