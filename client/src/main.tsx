import { Buffer } from "buffer";
window.Buffer = Buffer;

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
import NetworkPanel from './components/hud/NetworkPanel';
// then use:
<NetworkPanel />
```

**Your `.env` needs these names exactly:**
```
VITE_HELIUS_API_KEY
VITE_BIRD_API_KEY
VITE_L_CRUSH_A
VITE_L_CRUSH_B