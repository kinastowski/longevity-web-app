'use client';

import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '@/amplify/data/resource';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const client = generateClient<Schema>({ authMode: 'userPool' });

export function SageToggle() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [sageMode, setSageMode] = useState(false);

  useEffect(() => {
    void client.models.UserProfile.list().then(({ data }) => {
      const profile = data[0];
      if (profile) {
        setProfileId(profile.id);
        setSageMode(profile.sage_mode ?? false);
      }
    });
  }, []);

  const toggle = async () => {
    if (!profileId) return;
    const next = !sageMode;
    setSageMode(next); // optimistic update
    await client.models.UserProfile.update({ id: profileId, sage_mode: next });
  };

  return (
    <div className="flex items-center gap-2">
      <Switch id="sage-mode" checked={sageMode} onCheckedChange={toggle} />
      <Label
        htmlFor="sage-mode"
        className="text-sm font-medium cursor-pointer select-none text-slate-700"
      >
        SAGE Mode
      </Label>
    </div>
  );
}
