import {ItemDraft} from "../../itemEditor/ItemDraft";
import ItemPreviewPane from "../../itemEditor/ItemPreviewPane";
import ItemFieldsPanel from "../../itemEditor/ItemFieldsPanel";
import {itemData, updateItem} from "../state/itemOps";
import {imageOptions, inMemory, newAssetPath} from "../state/assetOps";
import {itemFile, relativePath, resolvePath} from "../state/worldPaths";
import {assetUrlFor} from "../state/assetUrls";

// The item level: the in-game tooltip preview (left) and the item editor's
// fields (right), over one item's file in the live draft. Its icon is one
// of the world's graphics/ images, or an upload into graphics/items/.
export default function ItemLevel({draft, item, onChange, repo}) {
  const path = itemFile(draft.worldKey, item);
  const data = itemData(draft, item);
  const assetUrl = (repoPath) => assetUrlFor(draft, repo, repoPath);

  const iconPicker = {
    options: imageOptions(draft, path, "graphics", assetUrl),
    url: data.icon_url ? assetUrl(resolvePath(path, data.icon_url)) : null,
    upload: async (file) => {
      const blob = await inMemory(file);
      const target = newAssetPath(draft, "graphics/items", file.name);
      onChange((current) => current.write(target, blob));
      return relativePath(path, target);
    },
  };

  return (
    <>
      <div className="content-editor-left">
        <div className="item-level-preview">
          <ItemPreviewPane key={item} itemData={data} />
        </div>
      </div>
      <div className="content-editor-fields item-level-fields">
        <ItemFieldsPanel
          draft={new ItemDraft(data)}
          onChange={(next) => onChange((current) => updateItem(current, item, next.data))}
          identifierEditable={false}
          iconPicker={iconPicker}
        />
      </div>
    </>
  );
}
