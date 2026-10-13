import {useEffect, useState} from "react";
import {loadStampSheets} from "../../game/stamps";

// The zone's stamp sheets, loaded: {[set]: image}, empty until they are.
// stamps is {sets, sheetUrl(set)} (see MapWorkbench), or null for none.
export function useStampSheets(stamps) {
  const [sheets, setSheets] = useState({});
  const urls = Object.fromEntries(Object.keys(stamps?.sets ?? {}).map((set) => [set, stamps.sheetUrl(set)]));
  const key = JSON.stringify(urls);
  useEffect(() => {
    let live = true;
    const bySet = JSON.parse(key);
    loadStampSheets(Object.fromEntries(Object.entries(bySet).map(([set, imageUrl]) => [set, {imageUrl}])), (url) => url)
      .then((loaded) => live && setSheets(loaded));
    return () => {
      live = false;
    };
  }, [key]);
  return sheets;
}
