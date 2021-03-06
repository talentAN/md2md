const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const slash = require("slash");
const {
  dir_filtered,
  name_dir_from,
  all_filtered,
  FileType,
} = require("./src/Consts");
const {
  writeFile,
  markdownToString,
  templateToString,
  classifyFileAndDir,
  isDirChild,
  isTypeFile,
  getFileType,
} = require("./src/helpers/File");
const {
  getChildrenPath,
  getTargetPath,
  getRootPath,
} = require("./src/helpers/Path");
const plugins = require("./src/plugin/index");

// helpers
const _genID = () => Math.random().toString().substring(2, 32);
const Logger = {
  start: (message) => console.log("=>", message),
  end: (message) => console.log("=>", message, "\n\n"),
};
// consts
const map_watcher = {};
const map_rule = {};
const register = (mark, fn) => {
  map_rule[mark] = fn;
};
// register default plugins
Object.keys(plugins).forEach((key) => {
  const { mark, fn } = plugins[key];
  register(mark, fn);
});
const _isFiltered = (path_abs) => {
  path_abs = slash(path_abs);
  const self_filtered = all_filtered.some((name_f) =>
    isTypeFile(path_abs, name_f)
  );
  const father_filtered = dir_filtered.some((name_d) =>
    isDirChild(path_abs, name_d)
  );
  return self_filtered || father_filtered;
};
const _copyDir = (path_from) => {
  path_from = slash(path_from);
  if (_isFiltered(path_from)) {
    return false;
  }
  const target = getTargetPath(path_from);
  const should_copy_this = !fs.existsSync(target);
  if (should_copy_this) {
    fs.mkdirSync(target);
  }
  const children = getChildrenPath(path_from) || [];
  const { directories } = classifyFileAndDir(children);
  if (directories.length) {
    directories.forEach((d) => {
      _copyDir(d);
    });
  }
};
// callbacks
const _customParse = (content, path_from) => {
  path_from = slash(path_from);
  Object.keys(map_rule).forEach((key) => {
    const fn = map_rule[key];
    content = fn(path_from, content);
  });
  return content;
};
const onFileAdd = (path_from) => {
  Logger.start(`Origin file ${path_from} is edited.`);
  path_from = slash(path_from);
  const type_file = getFileType(path_from);
  if (_isFiltered(path_from)) {
    switch (type_file) {
      // rewrite related file, to do later
      case FileType.template:
      case FileType.fragment:
      case FileType.variable:
        break;
      default:
        break;
    }
  } else {
    let path_to = getTargetPath(path_from);
    let content = "";
    switch (type_file) {
      case FileType.normalDoc:
        content = _customParse(markdownToString(path_from), path_from);
        break;
      case FileType.templateVar:
        path_to = path_to.replace(".json", ".md");
        content = _customParse(templateToString(path_from), path_from);
        break;
      default:
        content = fs.readFileSync(path_from);
        break;
    }
    writeFile(path_to, content);
    Logger.end(`Target File ${path_to} is updated.`);
  }
};
const onFileRemove = (path_from) => {
  path_from = slash(path_from);
  const path_target = getTargetPath(path_from);
  if (fs.existsSync(path_target)) {
    fs.unlinkSync(path_target);
  }
};
// const onAddDir = (path_from) => {
//   if (!_isFiltered(path_from)) {
//     const path_to = getTargetPath(path_from);
//     !fs.existsSync(path_to) &&
//       fs.mkdirSync(path_to, { recursive: true }, (err) => {});
//   }
// };
const _rmDir = (path_target) => {
  path_target = slash(path_target);
  if (fs.existsSync(path_target)) {
    let files = fs.readdirSync(path_target);
    for (var i = 0; i < files.length; i++) {
      let newPath = path.join(path_target, files[i]);
      let stat = fs.statSync(newPath);
      if (stat && !stat.isDirectory()) {
        fs.unlinkSync(newPath);
      } else {
        _rmDir(newPath);
      }
    }
    fs.rmdirSync(path_target);
  }
};
const onDirRemove = (path_from) => {
  path_from = slash(path_from);
  const path_target = getTargetPath(path_from);
  _rmDir(path_target);
};
const _goOverDone = () => {
  Logger.end(`Documents go over done.`);
};
// exports
const _setDirWatcher = (path_from) => {
  path_from = slash(path_from);
  const watcher = chokidar.watch(path_from);
  watcher
    .on("ready", _goOverDone)
    .on("add", onFileAdd)
    .on("change", onFileAdd)
    .on("unlink", onFileRemove)
    .on("unlinkDir", onDirRemove);
  const id = _genID();
  map_watcher[id] = watcher;
  return id;
};
const setDirWatcher = () => {
  return _setDirWatcher(path.resolve(getRootPath(), `${name_dir_from}/`));
};
const setFileWatcher = (path_from) => {
  path_from = slash(path_from);
  const watcher = chokidar.watch(path_from);
  watcher
    .on("ready", () => console.log(`start wartch file : ${path_from}`))
    .on("add", onFileAdd)
    .on("change", onFileAdd)
    .on("unlink", onFileRemove);
  const id = _genID();
  map_watcher[id] = watcher;
  return id;
};
const clearWatcher = (key) => {
  const watcher = map_watcher[key];
  watcher.close().then(() => console.log("watcher closed"));
};
const clearAllWatcher = () => {
  Object.keys(map_watcher).forEach((key) => {
    clearWatcher(key);
  });
};
const goOver = () => {
  const path_from = path.resolve(getRootPath(), `${name_dir_from}/`);
  const watcher = chokidar.watch(path_from);
  watcher
    .on("ready", () => {
      _goOverDone();
      process.exit();
    })
    .on("add", onFileAdd)
    .on("change", onFileAdd)
    .on("unlink", onFileRemove)
    .on("unlinkDir", onDirRemove);
};

module.exports = {
  setDirWatcher,
  setFileWatcher,
  clearWatcher,
  clearAllWatcher,
  goOver,

  markdownToString: (path_from) => {
    path_from = slash(path_from);
    return _customParse(markdownToString(path_from), path_from);
  },
  templateToString: (path_from) => {
    path_from = slash(path_from);
    return _customParse(templateToString(path_from), path_from);
  },
  register,
};
