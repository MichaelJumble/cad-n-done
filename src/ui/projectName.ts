const STORAGE_KEY = 'blockscad-next:projectName'

export function getProjectName(): string {
  return localStorage.getItem(STORAGE_KEY) ?? ''
}

export function setProjectName(name: string): void {
  localStorage.setItem(STORAGE_KEY, name)
}
