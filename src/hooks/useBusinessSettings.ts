import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rpc } from '@/lib/rpc'
import type { BusinessSettings } from '@/types/database'
import type { UpdateBusinessSettingsParams } from '@/types/rpc'

export const settingsKeys = {
  current: ['business-settings'] as const,
}

export async function fetchBusinessSettings(): Promise<BusinessSettings> {
  const { data, error } = await supabase
    .from('business_settings')
    .select('*')
    .eq('id', true)
    .single()
  if (error) throw error
  return data as BusinessSettings
}

export function useBusinessSettings() {
  return useQuery({
    queryKey: settingsKeys.current,
    queryFn: fetchBusinessSettings,
    staleTime: 30_000,
  })
}

export function useUpdateBusinessSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: UpdateBusinessSettingsParams) => {
      const result = await rpc.updateBusinessSettings(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.current })
    },
  })
}
