import React, { useRef, useState, useEffect } from "react";
import { BlobServiceClient } from "@azure/storage-blob";
import { AbortController } from "@azure/abort-controller";
import { LocalizationProvider, loadMessages } from "@progress/kendo-react-intl";
import {
  ExternalDropZone,
  Upload,
  UploadFileStatus,
} from "@progress/kendo-react-upload";


export function getFileSizeInBytes(files: any) {
    return [...files].reduce(
      (acc, file) => acc + file.size,
      0
    );
  }

const maxAllowedFileSize = 104857600 // 100 MB in bytes 


const AzureSasToken = 'https://stcommentsdevwestus001.blob.core.windows.net/?sv=2022-11-02&ss=b&srt=co&spr=https&se=2023-08-01T05%3A16%3A46Z&sp=wd&sig=ZgCE6pcsVckBcdR0qgHh6uI6clJelJBTVoRd%2B0HGtkY%3D' //replace empty string with valid SAS token of the account 
const AzureContainerName= 'comment-dev-temp' //replace empty string with the azure Container name, in which the files need tp be uploaded 

type Props = {
  //_updateUploadedFiles?: (key: any) => void; // redux action 
  //_removeUploadedFile?: (key: any) => void; // redux action
};

function AutoUploadComponent({
 // _updateUploadedFiles,
  //_removeUploadedFile,
}: Props) {
  const note = (
    <span>
      Maximum allowed files is 10. Maximum Size: 100MB. Acceptable file types are: .pdf, .txt, .jpg, .png
      Duplicate files are not allowed. 
    </span>
  );
  const pageReloadPostUploadRef: any = useRef();
  const pageReloadPostDeleteRef: any = useRef();
  const uploadRef: any = React.useRef(null);
  const progressRef: any = useRef({});
  const controllerRef: any = useRef({});
  const onAddFilesRef: any = useRef(false);
  const [files, setFiles] = useState([]);

  const [alertMsg, setAlertMsg] = useState("");




  useEffect(() => {
    //to change the status of a file from uploading to uploaded when the upload is successfully complete
    if (pageReloadPostUploadRef.current === true && files.length >0) {

        let _files : any = files.map((i:any)=>{
            if(i.progress === 100 && i.status === UploadFileStatus.Uploading){
                return {...i, status : UploadFileStatus.Uploaded}
            }else return i 
        })
     
      setTimeout(() => {
        setFiles(_files);
      });

      pageReloadPostUploadRef.current = false;
    }
  }, [files]);

  useEffect(() => {
    if (pageReloadPostDeleteRef.current) {
      const _files = files.filter((i: any) => i.status !== 6);
      setFiles(_files);
      pageReloadPostDeleteRef.current = false;
    }
  }, [files]);

  const onProgress = (event: any) => {
    setFiles(event.newState);
  };
  const onStatusChange = (event: any) => {
    setFiles(event.newState);
  };

  const onAdd: any = async (e: any) => {
 

    onAddFilesRef.current = true;
    let newFiles = e.newState
    const hasduplicateFiles = handleDuplicateFileCheck(newFiles);
    const isInvalidCount = handleFileCountCheck(newFiles);
    const isInvalidSize = handleFileSizeCheck(newFiles);

    //since kendo upload does not provide us built-in restrictions for restricting (sum of all file sizes), duplicate files and no. of files added, 
    //we need to write a separate logic for them. 
    if (isInvalidCount) {
     alert('You can only upload upto 10 files')
    } else if (isInvalidSize) {
        alert('Total Size cannot exceed 100 MB')
    } else if (hasduplicateFiles) {
        alert('files with same name and extensions cannot be uploaded')
    } else {

      setFiles(newFiles);
      setTimeout(() => {
        uploadRef.current.triggerUpload();
      });
    }
  };

  const handleFileSizeCheck = (selectedFiles: any) => {
    let totalSize = getFileSizeInBytes(selectedFiles);

    return totalSize > maxAllowedFileSize;
  };

  const handleDuplicateFileCheck = (selectedFiles: any) => {
    let selectedFilesNames = selectedFiles.map((i: any) => i.name);

    return selectedFilesNames.some(
      (val: any, i: any) => selectedFilesNames.indexOf(val) !== i
    );
  };

  const handleFileCountCheck = (selectedFiles: any) => {
    return selectedFiles.length > 10 ? true : false;
  };

  const onRemove = (e: any) => {
    setFiles(e.newState);
    handleFileSizeCheck(e.newState);
    handleDuplicateFileCheck(e.newState);
    handleFileCountCheck(e.newState);
  };

  const saveRequest: any = async (
    filesForUpload: any,
    options: any,
    onProgress: any
  ) => {
    let _controller = new AbortController(); // for aborting azure storage upload api
    controllerRef.current[filesForUpload[0].uid] = _controller;


    const file = filesForUpload[0];
    let i = file.getRawFile();

    const sasUri = AzureSasToken;
    const container = AzureContainerName;

    let blobService = new BlobServiceClient(sasUri);

    const ContainerClient = blobService.getContainerClient(container);

    let guid = file.uid;
    //sending filename in the below format, creates a folder with guid as the name and then uploads the file inside it. 
    //if fileName is file.name only, then the file will directly upload inside container, not being in any folder! 
    
    let fileName = `${guid}/${file.name}`;



    let BlobClient = ContainerClient.getBlockBlobClient(fileName);
    let _options = {
      abortSignal: _controller.signal,
      blockSize: 1 * 1024 * 1024, // 1MB block size
      concurrency: 20, // 20 concurrency
      onProgress: (ev: any) => {
        if (ev.loadedBytes === file.size) {
          i.status = 4;
          file.status = 4;
          i.progress = 100;
          file.progress = 100; 
          console.log("to be uploaded", file);

          //the below snippet adds uploaded files to redux storage using action: _updateUploadedFiles(file)
        //   let isFileExists = uploadedFiles.some(
        //     (i: any) => i.name === file.name
        //   );
        //   if (!isFileExists) _updateUploadedFiles(file);

          i.status = UploadFileStatus.Uploaded;
          file.status = UploadFileStatus.Uploaded;
          pageReloadPostUploadRef.current = true;
        }

        progressRef.current[file.uid] = ev.loadedBytes;
        onProgress(file.uid, { loaded: ev.loadedBytes, total: file.size });
        i.progress = ev.loadedBytes;
      },
      blobHTTPhEADERS: { blobContentType: file.type },
    };

    onProgress(file.uid, {
      loaded: progressRef.current[file.uid],
      total: file.size,
    });

    return BlobClient.uploadData(i, _options)
      .then((response) =>
        console.log(`${file.name} has been successfully uploaded`)
      )
      .catch((err) => {
        console.log(err);
        i.status = UploadFileStatus.UploadFailed;
        file.status = UploadFileStatus.UploadFailed;
      });
  };

  const handleRemoveFailed = (file: any) => {
    if (file) {
      let updatedFiles : any= files.map((i: any) => {
        if (i.name === file.name)
          return { ...i, status: UploadFileStatus.RemoveFailed };
        else return { ...i };
      });
      setFiles(updatedFiles);
    }
  };

  const removeRequest: any = async (selectedFiles: any) => {

    const currentFile = selectedFiles[0];

    const controller = new AbortController();
    const sasUri = AzureSasToken;
    const container = AzureContainerName;

    let blobService = new BlobServiceClient(sasUri);
    const ContainerClient = blobService.getContainerClient(container);

    let guid = currentFile.uid;
    let fileName = `${guid}/${currentFile.name}`;

    return ContainerClient.getBlockBlobClient(fileName)
      .deleteIfExists()
      .then((response) => {
        console.log(
          `${currentFile.name} has been successfully deleted`
        );
        let _files = files.filter((i: any) => i.uid !== currentFile.uid);
        handleFileCountCheck(_files);
        handleFileSizeCheck(_files);
        handleDuplicateFileCheck(_files);
      
        //the below line removes file from redux storage 
        // _removeUploadedFile(currentFile); 

        pageReloadPostDeleteRef.current = true;
      })
      .catch((err) => {
        console.log(err);
        handleRemoveFailed(currentFile);
      });
  };

  const onCancel = (e: any) => {
    const _files = [...files].filter((i:any) => i.uid !== e.uid);
    setFiles(_files);

    //the below snippet checks if the cancelled file is present in redux storage, if yes, it deletes from the same 
    // let cancelledFile = uploadedFiles.find((item: any) => item.uid === e.uid);
    // if (cancelledFile) {
    //   _removeUploadedFile(cancelledFile);
    // }

    //the below snippet is used to cancel an API request (upload api in this case ) and the upload process stops
    let _controller = controllerRef.current[e.uid];
    _controller?.abort();
  };

  loadMessages(
    {
      upload: {
        statusUploaded: "File successfully uploaded.",
        statusUploadFailed: "File failed to upload.",
      },
    },
    "myCustomMessages"
  );


  return (
    <div className='upload_container'>

      <div className="col-12">
        <div className="dropZoneElement mb-4 ">
          <ExternalDropZone
            uploadRef={uploadRef}
            className="dropImageHereText"
            aria-label="dropzone"
            customNote={note}
          />
        </div>
      </div>
      <div className="col-12 mb-5">
        <LocalizationProvider language="myCustomMessages">
          <Upload
            className="multipleUpload"
            onStatusChange={onStatusChange}
            showActionButtons={false}
            onProgress={onProgress}
            ref={uploadRef}
            aria-label="multipleUpload"
            onAdd={onAdd}
            batch={false}
            multiple={true}
            files={files}
            withCredentials={false}
            autoUpload={false} //by default it is true
            onRemove={onRemove}
            onCancel={onCancel}
            restrictions={{
              allowedExtensions: [
                ".pdf",
                ".txt",
                ".jpg",
                ".png"
              ],
            }}
            saveUrl={saveRequest}
            removeUrl={removeRequest}
          />
        </LocalizationProvider>
  
      </div>
    </div>
  );
}


export default AutoUploadComponent; 