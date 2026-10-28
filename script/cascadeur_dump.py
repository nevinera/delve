# Dumps the open Cascadeur scene's animation to JSON, reading only: each joint's global matrix
# (cm) at every frame. Run it through Cascadeur's script server ("MCP.Start script server"),
# which runs it the next time Cascadeur is busy, so click around in Cascadeur while it waits:
#
#   python3 -c "import json; print(json.dumps({'code': open('script/cascadeur_dump.py').read().replace('OUT_PATH', '$PWD/tmp/sweep.json')}))" \
#     | curl -s -m 120 -X POST --data-binary @- http://127.0.0.1:8765/run
#
# Then script/cascadeur_pose.mjs turns the dump into posed.js poses.
import json, traceback
out = {"errors": []}
try:
    mv = scene.model_viewer()
    dw = mv.data_viewer()
    bw = mv.behaviour_viewer()
    out["dw"] = [a for a in dir(dw) if not a.startswith("_")]
    try:
        n = dw.get_animation_size()
    except Exception:
        n = scene.get_animation_size() if hasattr(scene, "get_animation_size") else 0
        out["errors"].append(traceback.format_exc())
    out["frames"] = n
    joints = {}
    for j in bw.get_behaviours('Joint'):
        name = mv.get_object_name(bw.get_behaviour_owner(j))
        m = bw.get_behaviour_data(j, 'global_matrix')
        rows = []
        for f in range(n):
            v = dw.get_data_value(m, f)
            try:
                rows.append([[float(v[r, c]) for c in range(4)] for r in range(4)])
            except Exception:
                rows.append(repr(v))
        keys = []
        for meth in ("is_key", "is_keyframe"):
            if hasattr(dw, meth):
                try:
                    keys = [f for f in range(n) if getattr(dw, meth)(m, f)]
                    break
                except Exception:
                    out["errors"].append(traceback.format_exc())
        joints[name] = {"matrices": rows, "keys": keys}
    out["joints"] = joints
except Exception:
    out["errors"].append(traceback.format_exc())
with open("OUT_PATH", "w") as fh:
    json.dump(out, fh)
