'use client';

import { useState } from 'react';
import ChatThread from '@/components/chat/ChatThread';

interface FloatingChatBubbleProps {
  playerId: string;
  playerName: string;
  entryDate: string;
  unreadCount: number;
  isPwa?: boolean;
}

export default function FloatingChatBubble({
  playerId,
  playerName,
  entryDate,
  unreadCount,
  isPwa = false,
}: FloatingChatBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);

  const bottomOffset = isPwa
    ? 'calc(76px + env(safe-area-inset-bottom))'
    : '20px';

  return (
    <>
      {/* Floating Chat Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed right-5 z-40 flex items-center justify-center w-14 h-14 bg-green-600 rounded-full shadow-lg hover:bg-green-700 transition-colors duration-200"
          style={{
            bottom: bottomOffset,
          }}
          aria-label="Open chat"
        >
          {/* Chat Bubble Icon */}
          <svg
            className="w-7 h-7 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .97 4.29L2 22l6.29-.97C9.57 21.64 10.96 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.41 0-2.73-.36-3.88-.98l-.28-.15-2.89.44.44-2.89-.15-.28C4.36 14.73 4 13.41 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z" />
          </svg>

          {/* Unread Badge */}
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 flex items-center justify-center w-6 h-6 bg-red-500 rounded-full text-white text-xs font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Slide-up Panel */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom-full duration-300"
            style={{
              maxHeight: '70vh',
              paddingBottom: isPwa ? 'env(safe-area-inset-bottom)' : '0',
            }}
          >
            {/* Close Button */}
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {playerName}
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                aria-label="Close chat"
              >
                <svg
                  className="w-6 h-6 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Chat Thread Container */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 60px)' }}>
              <ChatThread
                playerId={playerId}
                playerName={playerName}
                entryDate={entryDate}
                viewerRole="player"
                compact={false}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
