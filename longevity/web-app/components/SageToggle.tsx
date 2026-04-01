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
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // Fetch once on mount — profile is stable for the session
    const fetchProfile = async () => {
      try {
        const { data } = await client.models.UserProfile.list();
        const profile = data[0];
        if (profile) {
          setProfileId(profile.id);
          setSageMode(profile.sage_mode ?? false);
        }
      } catch (error) {
        console.error('[SageToggle] Failed to load UserProfile:', error);
      }
    };
    void fetchProfile();
  }, []);

  const toggle = async () => {
    if (!profileId || isUpdating) return;
    const next = !sageMode;
    setSageMode(next); // optimistic update
    setIsUpdating(true);
    try {
      await client.models.UserProfile.update({ id: profileId, sage_mode: next });
    } catch (error) {
      console.error('[SageToggle] Failed to update sage_mode:', error);
      setSageMode(!next); // rollback
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="sage-mode"
        checked={sageMode}
        onCheckedChange={toggle}
        disabled={!profileId || isUpdating}
      />
      <Label
        htmlFor="sage-mode"
        className="text-sm font-medium cursor-pointer select-none text-slate-700"
      >
        SAGE Mode
      </Label>
    </div>
  );
}
