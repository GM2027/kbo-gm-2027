import React, { useState } from 'react';
import { Award } from 'lucide-react';
import { resolvePublicAssetUrl } from '../utils/assetUrl';

/** 사용자가 업로드한 투명 배경 KBO 골든글러브 트로피 이미지 (골든글러브 전용) */
export const KBO_GOLDEN_GLOVE_PNG_URL =
  '/assets/aistudio/71d75e43-000f-4e5b-9bdc-76772cba0664_eb893073.png';

interface GoldenGloveIconProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const GoldenGloveIcon: React.FC<GoldenGloveIconProps> = ({
  size = 'sm',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'xs'
      ? 'w-4 h-4'
      : size === 'lg'
      ? 'w-20 h-20'
      : size === 'md'
      ? 'w-7 h-7'
      : 'w-5 h-5';

  if (failed) {
    return <Award className={`${dims} text-amber-400 shrink-0 ${className}`} />;
  }

  return (
    <img
      src={resolvePublicAssetUrl(KBO_GOLDEN_GLOVE_PNG_URL)}
      alt="KBO 골든글러브"
      onError={() => setFailed(true)}
      draggable={false}
      className={`${dims} object-contain shrink-0 select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] ${className}`}
    />
  );
};
