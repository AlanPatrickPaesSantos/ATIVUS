import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export function clearProtectedQueryCache() {
  queryClient.removeQueries({ queryKey: ['dashboard'] })
  queryClient.removeQueries({ queryKey: ['inventory'] })
  queryClient.removeQueries({ queryKey: ['reports'] })
}

export function AppProviders({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
