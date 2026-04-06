const fs = require('fs');

function fix(file) {
  let txt = fs.readFileSync(file, 'utf8');

  // add import
  if (!txt.includes('useToast')) {
    txt = txt.replace(/import \{.*?\} from 'react';/, match => match + \nimport { useToast } from '@/contexts/toast-context';);
  }

  // replace declaration
  txt = txt.replace(/const \[error, setError\] = useState<string>\(.*?\)|\n\s*const \[error, setError\] = useState\('.*?'\);/, '\n  const { toast } = useToast();');

  // replace usages
  txt = txt.replace(/setError\((.*?)\);/g, (match, grp) => {
    if (grp === "''" || grp === "\"\"" || grp === "\\") return "";
    return "toast(" + grp + ", 'error');";
  });

  // remove UI usage
  txt = txt.replace(/\{\s*error\s*&&\s*\([\s\S]*?\{error\}[\s\S]*?\}\s*\)/g, '');
  txt = txt.replace(/\{\s*error\s*&&\s*<[\s\S]*?\{error\}[\s\S]*?>\s*\}/g, '');

  fs.writeFileSync(file, txt);
}

['frontend/src/pages/login.tsx', 'frontend/src/pages/repos/new.tsx', 'frontend/src/pages/dashboard.tsx', 'frontend/src/components/deploy-button.tsx'].forEach(p => {
  try {
    fix(p);
    console.log('Fixed', p);
  } catch(e) {
    console.log('Fail', p, e.message);
  }
});
