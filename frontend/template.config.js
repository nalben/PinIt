const path = require('path');

module.exports = {
  templateRootPath: './.templates',

  replaceFileTextFn: (fileText, templateName, utils) => {
    const { changeCase } = utils;
    return fileText
      .replace(/__templateName__/g, templateName)
      .replace(/__templateNameToPascalCase__/g, changeCase.pascalCase(templateName));
  },

  renameFileFn: (fileName, templateName, utils) => {
    const { changeCase } = utils;
    return fileName.replace(/__templateName__/g, changeCase.paramCase(templateName))
                   .replace(/__templateNameToPascalCase__/g, changeCase.pascalCase(templateName));
  },

  renameSubDirectoriesFn: (dirName, templateName, utils) => {
    // нет вложенных папок, поэтому ничего не делаем
    return dirName;
  },

  outputPath: (templateName, utils) => {
    const { changeCase } = utils;
    // создаём папку с именем страницы прямо в корне проекта
    return path.join(process.cwd(), changeCase.paramCase(templateName));
  }
};
