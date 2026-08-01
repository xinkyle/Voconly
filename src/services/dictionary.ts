/**
 * 用户词典服务
 * 封装词典相关的 Tauri 命令
 */

import { invoke } from '../utils/tauri';
import { createLogger } from './log';
import type { DictionaryEntry, UserDictionary } from '../types';

const log = createLogger('Dictionary');

/**
 * 获取用户词典
 */
export async function getUserDictionary(): Promise<UserDictionary> {
  log.debug('getUserDictionary: invoking get_user_dictionary command...');
  try {
    const result = await invoke<UserDictionary>('get_user_dictionary');
    log.debug(`getUserDictionary: entries=${result.entries.length}`);
    return result;
  } catch (err) {
    log.error(`getUserDictionary: error=${err}`);
    throw err;
  }
}

/**
 * 保存用户词典
 */
export async function saveUserDictionary(dictionary: UserDictionary): Promise<void> {
  log.debug(`saveUserDictionary: entries=${dictionary.entries.length}`);
  return invoke<void>('save_user_dictionary', { dictionary });
}

/**
 * 添加词典词条
 */
export async function addDictionaryEntry(entry: DictionaryEntry): Promise<void> {
  log.debug(`addDictionaryEntry: word=${entry.word}`);
  return invoke<void>('add_dictionary_entry', { entry });
}

/**
 * 删除词典词条
 */
export async function removeDictionaryEntry(word: string): Promise<void> {
  log.debug(`removeDictionaryEntry: word=${word}`);
  return invoke<void>('remove_dictionary_entry', { word });
}

export default {
  getUserDictionary,
  saveUserDictionary,
  addDictionaryEntry,
  removeDictionaryEntry,
};