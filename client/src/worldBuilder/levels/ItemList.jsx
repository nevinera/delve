import ContentList from "./ContentList";
import ImportForm from "./ImportForm";
import {createItem, deleteItem, itemData, itemKeys, itemUses, renameItem} from "../state/itemOps";
import {libraryItems, prepareItemImport} from "../state/importing";

// The world's own items (see ContentList): rename rewrites every loot table
// and zone entry using it; delete is refused while any unit drops it.
export default function ItemList({draft, onChange, onOpen, library}) {
  function describe(key) {
    const data = itemData(draft, key);
    const droppers = itemUses(draft, key).reduce((sum, {count}) => sum + count, 0);
    return {name: data.name, detail: `${data.slot ?? "no slot"} · ${droppers ? `dropped by ${droppers}` : "not dropped"}`};
  }

  return (
    <ContentList
      title="Items" noun="item" keys={itemKeys(draft)} describe={describe}
      create={(key, name) => createItem(draft, key, name)}
      rename={(from, to) => renameItem(draft, from, to)}
      remove={(key) => deleteItem(draft, key)}
      onChange={onChange} onOpen={onOpen}
      renderImport={library && ((props) => (
        <ImportForm noun="item" draft={draft} library={library} list={libraryItems} prepare={prepareItemImport} onChange={onChange} {...props} />
      ))}
    />
  );
}
