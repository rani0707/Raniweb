// Fixed source only: never interpolate user data into the theme bootstrap script.
export const THEME_INITIALIZER = "(function(){var t;try{t=localStorage.getItem('theme')}catch(e){}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t})()"
