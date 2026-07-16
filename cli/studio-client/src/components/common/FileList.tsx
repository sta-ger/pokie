import {List, Text} from "@mantine/core";

export function FileList({title, files}: {title: string; files: string[]}) {
    if (files.length === 0) {
        return null;
    }
    return (
        <div>
            <Text fw={600} size="sm" mb={4}>
                {title}
            </Text>
            <List size="sm" spacing={4}>
                {files.map((file) => (
                    <List.Item key={file}>{file}</List.Item>
                ))}
            </List>
        </div>
    );
}
