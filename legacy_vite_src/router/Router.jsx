import React, { useState, useEffect, createContext, useContext } from 'react';

const RouterContext = createContext({
  path: '/',
  params: {},
  navigate: () => {},
});

export function useRouter() {
  return useContext(RouterContext);
}

export function Link({ href, children, className = '', title, onClick, ...rest }) {
  const { navigate } = useRouter();

  const handleClick = (e) => {
    // Let standard click behavior handle open in new tab (Ctrl/Cmd + click)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    
    e.preventDefault();
    if (onClick) onClick(e);
    navigate(href);
  };

  return (
    <a href={href} className={className} title={title} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

function parseRouteParams(pathname) {
  const clean = pathname.split('?')[0] || '/';
  if (clean.startsWith('/clip/')) {
    const rawId = clean.substring('/clip/'.length).split('/')[0];
    if (rawId) {
      return { sessionId: rawId };
    }
  }
  return {};
}

export function RouterProvider({ children }) {
  const [path, setPath] = useState(window.location.pathname || '/');

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname || '/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (newUrl, replace = false) => {
    const pathname = newUrl.split('?')[0] || '/';
    if (replace) {
      window.history.replaceState({}, '', newUrl);
    } else {
      window.history.pushState({}, '', newUrl);
    }
    setPath(pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const params = parseRouteParams(path);

  return (
    <RouterContext.Provider value={{ path, params, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}
