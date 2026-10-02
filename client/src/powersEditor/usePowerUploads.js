import {useRef, useState} from "react";
import {reindexBySection} from "../abilityEditor/reindexBySection";
import {swapIndices, withoutIndex} from "./indexedMaps";

function revokeAll(urls) {
  for (const url of Object.values(urls ?? {})) URL.revokeObjectURL(url);
}

// Unsaved asset uploads for an owner's inline powers (icons, graphics,
// sounds). `overrides` holds blob: preview URLs by power index, then by
// assetOverrideKey (see resolveAbilityForPlayback); the Files themselves,
// keyed the same way, come from files() at save time. Every edit that
// reshapes the powers array has a matching call here so uploads stay with
// their own power and entry.
export function usePowerUploads(onDirty) {
  const [overrides, setOverrides] = useState({});
  const filesRef = useRef({});

  function upload(powerIndex, field, file) {
    const previous = overrides[powerIndex]?.[field];
    if (previous) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(file);
    const files = filesRef.current;
    filesRef.current = {...files, [powerIndex]: {...files[powerIndex], [field]: file}};
    setOverrides((current) => ({...current, [powerIndex]: {...current[powerIndex], [field]: url}}));
    onDirty?.();
  }

  function clear(powerIndex, field) {
    const previous = overrides[powerIndex]?.[field];
    if (previous) URL.revokeObjectURL(previous);
    const {[field]: _file, ...files} = filesRef.current[powerIndex] ?? {};
    filesRef.current = {...filesRef.current, [powerIndex]: files};
    setOverrides((current) => {
      const {[field]: _url, ...rest} = current[powerIndex] ?? {};
      return {...current, [powerIndex]: rest};
    });
  }

  function removeEntry(powerIndex, section, index) {
    const files = filesRef.current;
    filesRef.current = {...files, [powerIndex]: reindexBySection(files[powerIndex] ?? {}, section, index)};
    setOverrides((current) => ({
      ...current,
      [powerIndex]: reindexBySection(current[powerIndex] ?? {}, section, index, (url) => URL.revokeObjectURL(url)),
    }));
  }

  function removePower(index) {
    filesRef.current = withoutIndex(filesRef.current, index);
    setOverrides((current) => withoutIndex(current, index, revokeAll));
  }

  function swapPowers(a, b) {
    filesRef.current = swapIndices(filesRef.current, a, b);
    setOverrides((current) => swapIndices(current, a, b));
  }

  // After a save the files are committed; the previews stay, since the
  // saved files only show up on GitHub's CDN a little later.
  function committed() {
    filesRef.current = {};
  }

  return {overrides, files: () => filesRef.current, upload, clear, removeEntry, removePower, swapPowers, committed};
}
