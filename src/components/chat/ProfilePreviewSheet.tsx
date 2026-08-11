'use client';

import React from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import { Heart, Crown, Sparkles, User, Shield, X, MapPin } from 'lucide-react';

interface PartnerProfile {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  gender: string;
  mood?: string;
  personalityPreferences?: string;
  bio?: string;
  isVIP: boolean;
}

interface ProfilePreviewSheetProps {
  isOpen: boolean;
  onClose: () => void;
  partner: PartnerProfile | null;
}

export default function ProfilePreviewSheet({
  isOpen,
  onClose,
  partner,
}: ProfilePreviewSheetProps) {
  if (!partner) return null;

  const personalityTags = partner.personalityPreferences
    ? partner.personalityPreferences.split(',').filter(Boolean)
    : [];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`@${partner.username}'s Profile`}>
      <div className="space-y-5 py-2 text-white">
        
        {/* Header Avatar & Handle */}
        <div className="text-center space-y-3">
          <div className="relative w-24 h-24 mx-auto">
            <img
              src={partner.avatarUrl || '/default-avatar.png'}
              alt={partner.username}
              className="w-24 h-24 rounded-3xl object-cover border-2 border-pink-500/40 shadow-xl shadow-pink-500/20"
            />
            {partner.isVIP && (
              <div className="absolute -top-2 -right-2 p-1.5 rounded-full bg-gradient-to-tr from-yellow-500 to-amber-400 text-slate-950 shadow-md">
                <Crown className="w-4 h-4 fill-current" />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-center space-x-1.5">
              <h3 className="text-xl font-black tracking-tight text-white">@{partner.username}</h3>
              {partner.isVIP && (
                <span className="text-[10px] font-black text-yellow-300 bg-yellow-500/20 px-2 py-0.5 rounded-full border border-yellow-500/30 flex items-center gap-1">
                  <Crown className="w-3 h-3 fill-current" /> 💎 VIP
                </span>
              )}
            </div>
            <p className="text-xs text-pink-200/70">{partner.fullName}</p>
          </div>
        </div>

        {/* Current Mood Pill */}
        {partner.mood && (
          <div className="p-3 rounded-2xl bg-white/5 border border-pink-500/20 text-center space-y-1">
            <span className="text-[10px] font-bold text-pink-300 uppercase tracking-wider block">Current Mood</span>
            <p className="text-sm font-extrabold text-white">{partner.mood}</p>
          </div>
        )}

        {/* Bio */}
        {partner.bio && (
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs text-pink-100/90 leading-relaxed text-center">
            "{partner.bio}"
          </div>
        )}

        {/* Personality Tags */}
        {personalityTags.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-pink-300 uppercase tracking-wider block text-center">
              Personality Tags
            </span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {personalityTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-full bg-gradient-to-r from-pink-600/30 to-purple-600/30 text-pink-200 text-xs font-semibold border border-pink-500/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl font-bold bg-white/10 hover:bg-white/20 text-white text-xs transition-colors cursor-pointer"
        >
          Close Preview
        </button>

      </div>
    </BottomSheet>
  );
}
